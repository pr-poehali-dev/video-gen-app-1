"""
Отправляет видео в Telegram-чат или канал через бота.
Принимает URL видео, chat_id и подпись. Отправляет как видео или ссылку.
"""
import json
import os
import urllib.request
import urllib.error
import urllib.parse


def tg_request(method: str, payload: dict) -> dict:
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    url = f"https://api.telegram.org/bot{token}/{method}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def handler(event: dict, context) -> dict:
    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers, "body": ""}

    if event.get("httpMethod") != "POST":
        return {"statusCode": 405, "headers": cors_headers, "body": json.dumps({"error": "Method not allowed"})}

    body = json.loads(event.get("body") or "{}")
    chat_id = body.get("chatId", "").strip()
    video_url = body.get("videoUrl", "").strip()
    caption = body.get("caption", "").strip()
    prompt = body.get("prompt", "").strip()

    if not chat_id:
        return {"statusCode": 400, "headers": cors_headers,
                "body": json.dumps({"error": "chatId обязателен"})}
    if not video_url:
        return {"statusCode": 400, "headers": cors_headers,
                "body": json.dumps({"error": "videoUrl обязателен"})}

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        return {"statusCode": 500, "headers": cors_headers,
                "body": json.dumps({"error": "TELEGRAM_BOT_TOKEN не настроен"})}

    full_caption = caption or f"🎬 Видео сгенерировано с помощью Runway ML Gen-3"
    if prompt:
        full_caption += f"\n\n📝 Промпт: {prompt[:200]}"
    full_caption += "\n\n✨ Создано в FrameForge AI"

    try:
        # Сначала пробуем отправить как видео по URL
        result = tg_request("sendVideo", {
            "chat_id": chat_id,
            "video": video_url,
            "caption": full_caption,
            "supports_streaming": True,
            "parse_mode": "HTML",
        })
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps({
                "ok": True,
                "method": "video",
                "messageId": result.get("result", {}).get("message_id"),
            }),
        }
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        # Если видео не получилось — отправляем как ссылку текстом
        try:
            result = tg_request("sendMessage", {
                "chat_id": chat_id,
                "text": f"{full_caption}\n\n🔗 <a href=\"{video_url}\">Скачать видео</a>",
                "parse_mode": "HTML",
                "disable_web_page_preview": False,
            })
            return {
                "statusCode": 200,
                "headers": cors_headers,
                "body": json.dumps({
                    "ok": True,
                    "method": "link",
                    "messageId": result.get("result", {}).get("message_id"),
                    "note": "Видео отправлено как ссылка",
                }),
            }
        except urllib.error.HTTPError as e2:
            err2 = e2.read().decode("utf-8")
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({
                    "error": "Ошибка Telegram API",
                    "details": err2,
                    "hint": "Проверьте chat_id: для личного чата перешлите боту сообщение и используйте числовой ID",
                }),
            }
    except Exception as ex:
        return {"statusCode": 500, "headers": cors_headers,
                "body": json.dumps({"error": str(ex)})}
