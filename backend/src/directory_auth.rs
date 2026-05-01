use anyhow::{anyhow, Context, Result};
use ldap3::{LdapConnAsync, Scope, SearchEntry};
use serde::Deserialize;

use crate::settings::AppSettings;

#[derive(Debug, Default, Deserialize)]
pub struct DirectoryRoleMappings {
    #[serde(default)]
    pub admin_groups: Vec<String>,
    #[serde(default)]
    pub engineer_groups: Vec<String>,
    #[serde(default)]
    pub viewer_groups: Vec<String>,
}

impl DirectoryRoleMappings {
    pub fn parse(toml_str: &str) -> Result<Self> {
        if toml_str.trim().is_empty() {
            return Ok(Self::default());
        }
        toml::from_str(toml_str).context("invalid AD role mapping TOML")
    }

    pub fn role_for_groups(&self, groups: &[String], default_role: &str) -> String {
        if any_group_matches(groups, &self.admin_groups) {
            return "admin".to_string();
        }
        if any_group_matches(groups, &self.engineer_groups) {
            return "engineer".to_string();
        }
        if any_group_matches(groups, &self.viewer_groups) {
            return "viewer".to_string();
        }
        default_role.to_string()
    }
}

pub struct DirectoryLogin {
    pub username: String,
    pub email: String,
    pub role: String,
}

pub async fn authenticate(
    settings: &AppSettings,
    username: &str,
    password: &str,
) -> Result<Option<DirectoryLogin>> {
    if !settings.ad_enabled {
        return Ok(None);
    }
    if username.trim().is_empty() || password.is_empty() {
        return Ok(None);
    }
    if settings.ad_url.trim().is_empty()
        || settings.ad_bind_dn.trim().is_empty()
        || settings.ad_bind_password.is_empty()
        || settings.ad_base_dn.trim().is_empty()
    {
        return Err(anyhow!(
            "AD/LDAP is enabled but connection settings are incomplete"
        ));
    }

    let mappings = DirectoryRoleMappings::parse(&settings.ad_role_mappings_toml)?;
    let (conn, mut ldap) = LdapConnAsync::new(&settings.ad_url)
        .await
        .with_context(|| format!("failed to connect to {}", settings.ad_url))?;
    ldap3::drive!(conn);

    ldap.simple_bind(&settings.ad_bind_dn, &settings.ad_bind_password)
        .await
        .context("directory bind failed")?
        .success()
        .context("directory bind rejected")?;

    let escaped_username = escape_filter_value(username);
    let filter = settings
        .ad_user_filter
        .replace("{username}", &escaped_username);
    let group_attr = settings.ad_group_attribute.trim();
    let attrs = vec![group_attr, "mail", "userPrincipalName"];
    let (entries, _) = ldap
        .search(&settings.ad_base_dn, Scope::Subtree, &filter, attrs)
        .await
        .context("directory user search failed")?
        .success()
        .context("directory user search rejected")?;

    let Some(raw_entry) = entries.into_iter().next() else {
        ldap.unbind().await.ok();
        return Ok(None);
    };
    let entry = SearchEntry::construct(raw_entry);
    let user_dn = entry.dn.clone();
    let groups = entry.attrs.get(group_attr).cloned().unwrap_or_default();
    let email = first_attr(&entry, "mail")
        .or_else(|| first_attr(&entry, "userPrincipalName"))
        .unwrap_or_else(|| username.to_string());

    ldap.simple_bind(&user_dn, password)
        .await
        .context("user bind failed")?
        .success()
        .context("user bind rejected")?;
    ldap.unbind().await.ok();

    Ok(Some(DirectoryLogin {
        username: username.to_string(),
        email,
        role: mappings.role_for_groups(&groups, &settings.ad_default_role),
    }))
}

fn first_attr(entry: &SearchEntry, attr: &str) -> Option<String> {
    entry
        .attrs
        .get(attr)
        .and_then(|values| values.first())
        .cloned()
}

fn any_group_matches(user_groups: &[String], mapped_groups: &[String]) -> bool {
    mapped_groups
        .iter()
        .filter(|group| !group.trim().is_empty())
        .any(|mapped| {
            user_groups
                .iter()
                .any(|actual| group_matches(actual, mapped))
        })
}

fn group_matches(actual: &str, mapped: &str) -> bool {
    let actual_lower = actual.to_lowercase();
    let mapped_lower = mapped.trim().to_lowercase();
    if actual_lower == mapped_lower {
        return true;
    }
    if mapped_lower.contains('=') {
        return false;
    }
    actual_lower.contains(&format!("cn={}", mapped_lower))
}

fn escape_filter_value(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '*' => escaped.push_str("\\2a"),
            '(' => escaped.push_str("\\28"),
            ')' => escaped.push_str("\\29"),
            '\\' => escaped.push_str("\\5c"),
            '\0' => escaped.push_str("\\00"),
            _ => escaped.push(ch),
        }
    }
    escaped
}
