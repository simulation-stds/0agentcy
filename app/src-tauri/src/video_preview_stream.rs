use futures_util::TryStreamExt;
use http_body_util::{combinators::UnsyncBoxBody, BodyExt, Empty, StreamBody};
use hyper::{
    body::{Bytes, Frame, Incoming},
    header,
    server::conn::http1,
    service::service_fn,
    Method, Request, Response, StatusCode,
};
use hyper_util::rt::TokioIo;
use std::{convert::Infallible, io, path::PathBuf, sync::Arc};
use tokio::{
    fs::File,
    io::{AsyncReadExt, AsyncSeekExt, SeekFrom},
    net::TcpListener,
    sync::{OnceCell, RwLock},
};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

type Body = UnsyncBoxBody<Bytes, io::Error>;
type Selection = Arc<RwLock<Option<Preview>>>;

#[derive(Clone)]
struct Preview {
    route: String,
    path: PathBuf,
}

struct PreviewServer {
    port: u16,
    video: Selection,
    audio: Selection,
}

static SERVER: OnceCell<PreviewServer> = OnceCell::const_new();

pub async fn preview_url(path: PathBuf) -> io::Result<String> {
    register(path, "video").await
}

pub async fn audio_url(path: PathBuf) -> io::Result<String> {
    register(path, "audio").await
}

async fn register(path: PathBuf, kind: &str) -> io::Result<String> {
    let path = tokio::fs::canonicalize(path).await?;
    if !tokio::fs::metadata(&path).await?.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Expected a media file",
        ));
    }
    let server = SERVER.get_or_try_init(start_server).await?;
    let route = format!("/{kind}/{}", Uuid::new_v4());
    let url = format!("http://127.0.0.1:{}{route}", server.port);
    let selection = if kind == "audio" {
        &server.audio
    } else {
        &server.video
    };
    *selection.write().await = Some(Preview { route, path });
    Ok(url)
}

async fn start_server() -> io::Result<PreviewServer> {
    let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await?;
    let port = listener.local_addr()?.port();
    let video = Selection::default();
    let audio = Selection::default();
    let active_video = video.clone();
    let active_audio = audio.clone();
    tauri::async_runtime::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let video = active_video.clone();
            let audio = active_audio.clone();
            tauri::async_runtime::spawn(async move {
                let service = service_fn(move |request| {
                    let active = if request.uri().path().starts_with("/audio/") {
                        audio.clone()
                    } else {
                        video.clone()
                    };
                    async move { Ok::<_, Infallible>(serve(request, &active).await) }
                });
                let _ = http1::Builder::new()
                    .serve_connection(TokioIo::new(stream), service)
                    .await;
            });
        }
    });
    Ok(PreviewServer { port, video, audio })
}

async fn serve(request: Request<Incoming>, selection: &Selection) -> Response<Body> {
    let selected = selection
        .read()
        .await
        .as_ref()
        .filter(|preview| preview.route == request.uri().path())
        .cloned();
    let Some(preview) = selected else {
        return empty(StatusCode::NOT_FOUND);
    };
    if request.method() == Method::OPTIONS {
        let mut response = empty(StatusCode::NO_CONTENT);
        if let Some(origin) = request
            .headers()
            .get(header::ORIGIN)
            .filter(|origin| origin.to_str().is_ok_and(allowed_origin))
        {
            response
                .headers_mut()
                .insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin.clone());
            response.headers_mut().insert(
                header::ACCESS_CONTROL_ALLOW_METHODS,
                header::HeaderValue::from_static("GET, HEAD, OPTIONS"),
            );
            response.headers_mut().insert(
                header::ACCESS_CONTROL_ALLOW_HEADERS,
                header::HeaderValue::from_static("Range"),
            );
        }
        return response;
    }
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return empty(StatusCode::METHOD_NOT_ALLOWED);
    }
    match file_response(&request, preview).await {
        Ok(response) => response,
        Err(error) if error.kind() == io::ErrorKind::NotFound => empty(StatusCode::NOT_FOUND),
        Err(_) => empty(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn file_response(
    request: &Request<Incoming>,
    preview: Preview,
) -> io::Result<Response<Body>> {
    let mut file = File::open(&preview.path).await?;
    let size = file.metadata().await?.len();
    let content_type = mime_guess::from_path(&preview.path).first_or_octet_stream();
    let mut response = Response::builder()
        .header(header::CONTENT_TYPE, content_type.as_ref())
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff");

    if let Some(origin) = request
        .headers()
        .get(header::ORIGIN)
        .filter(|origin| origin.to_str().is_ok_and(allowed_origin))
    {
        response = response
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin)
            .header(header::VARY, "Origin")
            .header(
                header::ACCESS_CONTROL_EXPOSE_HEADERS,
                "Content-Length, Content-Range, Accept-Ranges",
            );
    }
    let (response, offset, length) = match request.headers().get(header::RANGE) {
        Some(range) => {
            match http_range::HttpRange::parse_bytes(range.as_bytes(), size).as_deref() {
                Ok([range]) if range.length > 0 => (
                    response.status(StatusCode::PARTIAL_CONTENT).header(
                        header::CONTENT_RANGE,
                        format!(
                            "bytes {}-{}/{size}",
                            range.start,
                            range.start + range.length - 1
                        ),
                    ),
                    range.start,
                    range.length,
                ),
                _ => {
                    return Ok(response
                        .status(StatusCode::RANGE_NOT_SATISFIABLE)
                        .header(header::CONTENT_RANGE, format!("bytes */{size}"))
                        .body(empty_body())
                        .expect("valid range response"));
                }
            }
        }
        None => (response, 0, size),
    };

    let body = if request.method() == Method::HEAD {
        empty_body()
    } else {
        file.seek(SeekFrom::Start(offset)).await?;
        StreamBody::new(ReaderStream::new(file.take(length)).map_ok(Frame::data)).boxed_unsync()
    };
    Ok(response
        .header(header::CONTENT_LENGTH, length)
        .body(body)
        .expect("valid media response"))
}

fn empty_body() -> Body {
    Empty::new().map_err(|never| match never {}).boxed_unsync()
}

fn empty(status: StatusCode) -> Response<Body> {
    let mut response = Response::new(empty_body());
    *response.status_mut() = status;
    response
}

fn allowed_origin(origin: &str) -> bool {
    matches!(
        origin,
        "tauri://localhost" | "http://tauri.localhost" | "https://tauri.localhost"
    ) || ["http://localhost:", "http://127.0.0.1:"]
        .iter()
        .any(|prefix| {
            origin
                .strip_prefix(prefix)
                .is_some_and(|port| port.parse::<u16>().is_ok())
        })
}
#[cfg(test)]
mod cors_tests {
    #[test]
    fn only_app_origins_receive_media_cors() {
        for origin in [
            "tauri://localhost",
            "http://127.0.0.1:1425",
            "http://localhost:1420",
        ] {
            assert!(super::allowed_origin(origin));
        }
        for origin in [
            "https://example.com",
            "http://localhost.evil:1420",
            "null",
            "http://127.0.0.1:1420/path",
        ] {
            assert!(!super::allowed_origin(origin));
        }
    }
}
