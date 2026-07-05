//! Live event feed from the local Riot client websocket.
//!
//! The client exposes `wss://127.0.0.1:{port}` (same lockfile Basic auth as the
//! REST API, self-signed cert). We subscribe to all events and fire the
//! caller's callback whenever a pregame / core-game / party message arrives —
//! the callback just triggers a fresh roster fetch, so the UI updates the
//! instant agent-select or a match begins, with no polling lag.

use std::net::TcpStream;
use std::time::Duration;

use tungstenite::client::IntoClientRequest;
use tungstenite::{Connector, Message};

use super::local;

/// URIs we care about — any event whose path contains one of these means the
/// roster may have changed.
const WATCH: [&str; 3] = ["pregame", "core-game", "parties"];

/// Block forever, watching the local client and invoking `on_change` on every
/// relevant event. Reconnects automatically when the client restarts. `on_change`
/// is also called once on each fresh connection so the UI syncs immediately.
pub fn watch(on_change: impl Fn()) {
    loop {
        match connect_and_listen(&on_change) {
            Ok(()) => {}
            Err(_e) => {
                // Client probably closed / not up yet — back off and retry.
            }
        }
        std::thread::sleep(Duration::from_secs(3));
    }
}

fn connect_and_listen(on_change: &impl Fn()) -> Result<(), String> {
    let (port, password) = local::read_lock()?;

    let tcp = TcpStream::connect(("127.0.0.1", port))
        .map_err(|e| format!("ws tcp connect: {e}"))?;
    let connector = Connector::NativeTls(
        native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(true)
            .danger_accept_invalid_hostnames(true)
            .build()
            .map_err(|e| format!("ws tls: {e}"))?,
    );

    let mut req = format!("wss://127.0.0.1:{port}/")
        .into_client_request()
        .map_err(|e| format!("ws request: {e}"))?;
    req.headers_mut().insert(
        "Authorization",
        local::basic_auth(&password)
            .parse()
            .map_err(|_| "ws auth header".to_string())?,
    );

    let (mut socket, _resp) = tungstenite::client_tls_with_config(req, tcp, None, Some(connector))
        .map_err(|e| format!("ws handshake: {e}"))?;

    // Subscribe to the firehose of client events.
    socket
        .send(Message::Text("[5, \"OnJsonApiEvent\"]".into()))
        .map_err(|e| format!("ws subscribe: {e}"))?;

    // Sync once on connect (e.g. we launched mid-match).
    on_change();

    loop {
        let msg = socket.read().map_err(|e| format!("ws read: {e}"))?;
        if let Message::Text(txt) = msg {
            if WATCH.iter().any(|w| txt.contains(w)) {
                on_change();
            }
        }
    }
}
