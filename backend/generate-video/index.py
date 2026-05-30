"""
Запускает генерацию видео через Runway ML Gen-3 Alpha по текстовому промпту.
Возвращает taskId для последующей проверки статуса.
"""
import json
import os
import urllib.request
import urllib.error


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
    prompt = body.get("prompt", "").strip()
    duration = int(body.get("duration", 10))

    if not prompt:
        return {"statusCode": 400, "headers": cors_headers, "body": json.dumps({"error": "Промпт не может быть пустым"})}

    duration = max(5, min(30, duration))

    api_key = os.environ.get("RUNWAY_API_KEY", "")
    if not api_key:
        return {"statusCode": 500, "headers": cors_headers, "body": json.dumps({"error": "RUNWAY_API_KEY не настроен"})}

    payload = json.dumps({
        "promptText": prompt,
        "model": "gen3a_turbo",
        "duration": duration,
        "ratio": "1280:720",
        "watermark": False,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.dev.runwayml.com/v1/image_to_video",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-Runway-Version": "2024-11-06",
        },
        method="POST",
    )

    # Gen-3 text-to-video endpoint
    req2 = urllib.request.Request(
        "https://api.dev.runwayml.com/v1/text_to_video",
        data=json.dumps({
            "promptText": prompt,
            "model": "gen3a_turbo",
            "duration": duration,
            "ratio": "1280:720",
            "watermark": False,
        }).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-Runway-Version": "2024-11-06",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req2, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        try:
            error_data = json.loads(error_body)
        except Exception:
            error_data = {"raw": error_body}
        return {
            "statusCode": e.code,
            "headers": cors_headers,
            "body": json.dumps({"error": f"Runway API error {e.code}", "details": error_data}),
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": str(e)}),
        }

    task_id = data.get("id")
    if not task_id:
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": "Не получен taskId от Runway", "raw": data}),
        }

    return {
        "statusCode": 200,
        "headers": cors_headers,
        "body": json.dumps({
            "taskId": task_id,
            "status": "PENDING",
            "prompt": prompt,
            "duration": duration,
        }),
    }
