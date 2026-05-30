"""
Проверяет статус задачи генерации видео в Runway ML.
Возвращает статус: PENDING | RUNNING | SUCCEEDED | FAILED, и URL видео при успехе.
"""
import json
import os
import urllib.request
import urllib.error


def handler(event: dict, context) -> dict:
    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers, "body": ""}

    params = event.get("queryStringParameters") or {}
    task_id = params.get("taskId", "").strip()

    if not task_id:
        return {
            "statusCode": 400,
            "headers": cors_headers,
            "body": json.dumps({"error": "taskId обязателен"}),
        }

    api_key = os.environ.get("RUNWAY_API_KEY", "")
    if not api_key:
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": "RUNWAY_API_KEY не настроен"}),
        }

    req = urllib.request.Request(
        f"https://api.dev.runwayml.com/v1/tasks/{task_id}",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-Runway-Version": "2024-11-06",
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        return {
            "statusCode": e.code,
            "headers": cors_headers,
            "body": json.dumps({"error": f"Runway API error {e.code}", "raw": error_body}),
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": str(e)}),
        }

    status = data.get("status", "UNKNOWN")
    output = data.get("output") or []
    video_url = output[0] if output else None
    progress = data.get("progressRatio", None)

    return {
        "statusCode": 200,
        "headers": cors_headers,
        "body": json.dumps({
            "taskId": task_id,
            "status": status,
            "videoUrl": video_url,
            "progress": progress,
            "error": data.get("failure") or data.get("failureCode"),
        }),
    }
