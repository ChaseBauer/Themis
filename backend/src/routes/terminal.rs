use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use ssh2::Session;
use std::{
    io::{Read, Write},
    net::{TcpStream, ToSocketAddrs},
    sync::mpsc,
    thread,
    time::Duration,
};
use uuid::Uuid;

use crate::{
    auth,
    error::{AppError, Result},
    models::device::Device,
    AppState,
};

#[derive(Deserialize)]
pub struct TerminalQuery {
    token: String,
}

pub async fn handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Query(query): Query<TerminalQuery>,
) -> Result<impl IntoResponse> {
    let claims = auth::verify_token(&query.token, &state.config.jwt_secret)
        .map_err(|_| AppError::Unauthorized)?;
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;

    let device = sqlx::query_as::<_, Device>("SELECT * FROM devices WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let host = device.ip_address;
    let port = device.ssh_port as u16;
    let username = device
        .ssh_username
        .ok_or_else(|| AppError::BadRequest("No SSH credentials configured".into()))?;
    let password = device
        .ssh_password
        .ok_or_else(|| AppError::BadRequest("No SSH credentials configured".into()))?;

    Ok(ws.on_upgrade(move |socket| relay(socket, host, port, username, password)))
}

async fn relay(socket: WebSocket, host: String, port: u16, username: String, password: String) {
    let (input_tx, input_rx) = mpsc::channel::<Vec<u8>>();
    let (resize_tx, resize_rx) = mpsc::channel::<(u32, u32)>();
    let (output_tx, mut output_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(64);

    let ssh_task = tokio::task::spawn_blocking(move || {
        run_ssh(
            host, port, username, password, input_rx, resize_rx, output_tx,
        )
    });

    let (mut ws_tx, mut ws_rx) = socket.split();

    let ws_to_ssh = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_rx.next().await {
            match msg {
                Message::Binary(data) if input_tx.send(data.to_vec()).is_err() => {
                    break;
                }
                Message::Text(text) => {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                        if val["type"] == "resize" {
                            let cols = val["cols"].as_u64().unwrap_or(80) as u32;
                            let rows = val["rows"].as_u64().unwrap_or(24) as u32;
                            let _ = resize_tx.send((cols, rows));
                        }
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    let ssh_to_ws = tokio::spawn(async move {
        while let Some(data) = output_rx.recv().await {
            if ws_tx.send(Message::Binary(data)).await.is_err() {
                break;
            }
        }
    });

    tokio::select! {
        _ = ws_to_ssh => {}
        _ = ssh_to_ws => {}
        _ = ssh_task => {}
    }
}

fn run_ssh(
    host: String,
    port: u16,
    username: String,
    password: String,
    input_rx: mpsc::Receiver<Vec<u8>>,
    resize_rx: mpsc::Receiver<(u32, u32)>,
    output_tx: tokio::sync::mpsc::Sender<Vec<u8>>,
) {
    let send = |msg: &str| {
        let _ = output_tx.blocking_send(msg.as_bytes().to_vec());
    };

    let addr = format!("{}:{}", host, port);
    let sock_addr = match addr.to_socket_addrs().ok().and_then(|mut i| i.next()) {
        Some(a) => a,
        None => {
            send(&format!(
                "\r\n\x1b[31mCould not resolve: {}\x1b[0m\r\n",
                addr
            ));
            return;
        }
    };

    let tcp = match TcpStream::connect_timeout(&sock_addr, Duration::from_secs(10)) {
        Ok(t) => t,
        Err(e) => {
            send(&format!("\r\n\x1b[31mConnection failed: {}\x1b[0m\r\n", e));
            return;
        }
    };

    let mut sess = match Session::new() {
        Ok(s) => s,
        Err(e) => {
            send(&format!("\r\n\x1b[31mSSH init error: {}\x1b[0m\r\n", e));
            return;
        }
    };

    sess.set_tcp_stream(tcp);

    if let Err(e) = sess.handshake() {
        send(&format!("\r\n\x1b[31mHandshake failed: {}\x1b[0m\r\n", e));
        return;
    }

    if let Err(e) = sess.userauth_password(&username, &password) {
        send(&format!("\r\n\x1b[31mAuth failed: {}\x1b[0m\r\n", e));
        return;
    }

    let mut channel = match sess.channel_session() {
        Ok(c) => c,
        Err(e) => {
            send(&format!("\r\n\x1b[31mChannel error: {}\x1b[0m\r\n", e));
            return;
        }
    };

    let _ = channel.request_pty("xterm-256color", None, Some((220, 50, 0, 0)));
    let _ = channel.shell();

    sess.set_blocking(false);

    let mut buf = [0u8; 4096];

    loop {
        match channel.read(&mut buf) {
            Ok(0) => {
                if channel.eof() {
                    break;
                }
            }
            Ok(n) => {
                if output_tx.blocking_send(buf[..n].to_vec()).is_err() {
                    break;
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(_) => break,
        }

        if channel.eof() {
            break;
        }

        while let Ok((cols, rows)) = resize_rx.try_recv() {
            let _ = channel.request_pty_size(cols, rows, None, None);
        }

        while let Ok(data) = input_rx.try_recv() {
            let _ = channel.write_all(&data);
        }

        thread::sleep(Duration::from_millis(10));
    }

    sess.set_blocking(true);
    let _ = channel.send_eof();
    let _ = channel.wait_close();
}
