{{/*
Expand the name of the chart.
*/}}
{{- define "themis.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "themis.fullname" -}}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "themis.backend.fullname" -}}
{{- printf "%s-backend" (include "themis.fullname" .) }}
{{- end }}

{{- define "themis.frontend.fullname" -}}
{{- printf "%s-frontend" (include "themis.fullname" .) }}
{{- end }}

{{- define "themis.postgres.fullname" -}}
{{- printf "%s-postgres" (include "themis.fullname" .) }}
{{- end }}

{{/*
Chart label.
*/}}
{{- define "themis.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "themis.labels" -}}
helm.sh/chart: {{ include "themis.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Selector labels. Used by Deployments and Services.
*/}}
{{- define "themis.backend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "themis.name" . }}-backend
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "themis.frontend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "themis.name" . }}-frontend
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "themis.postgres.selectorLabels" -}}
app.kubernetes.io/name: {{ include "themis.name" . }}-postgres
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
ServiceAccount name.
*/}}
{{- define "themis.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "themis.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Database URL. Uses bundled postgres or an external URL from the secret.
*/}}
{{- define "themis.databaseUrl" -}}
{{- if .Values.postgresql.enabled -}}
postgresql://{{ .Values.postgresql.auth.username }}:$(POSTGRES_PASSWORD)@{{ include "themis.postgres.fullname" . }}:5432/{{ .Values.postgresql.auth.database }}
{{- end -}}
{{- end }}
