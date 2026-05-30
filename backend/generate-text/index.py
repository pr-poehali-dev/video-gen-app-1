"""
Генерирует текст / субтитры / надписи для видео через OpenAI GPT-4o-mini.
Принимает тему и стиль, возвращает готовый текст.
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
    topic = body.get("topic", "").strip()
    style = body.get("style", "нейтральный").strip()
    text_type = body.get("type", "заголовок").strip()

    if not topic:
        return {"statusCode": 400, "headers": cors_headers, "body": json.dumps({"error": "Тема не может быть пустой"})}

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return {"statusCode": 500, "headers": cors_headers, "body": json.dumps({"error": "OPENAI_API_KEY не настроен"})}

    type_prompts = {
        "заголовок": "Напиши короткий броский заголовок для видео (до 8 слов).",
        "подзаголовок": "Напиши подзаголовок для видео (до 15 слов).",
        "слоган": "Напиши запоминающийся слоган (до 6 слов).",
        "описание": "Напиши краткое описание видео (2-3 предложения).",
        "субтитры": "Напиши субтитры / закадровый текст для видео (3-5 предложений).",
        "призыв к действию": "Напиши призыв к действию (CTA) для видео (до 10 слов).",
    }
    type_instruction = type_prompts.get(text_type, type_prompts["заголовок"])

    prompt = f"""Тема видео: {topic}
Стиль: {style}
Задача: {type_instruction}

Ответь ТОЛЬКО готовым текстом без кавычек, объяснений и лишних слов."""

    payload = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "Ты профессиональный копирайтер для видеоконтента. Пишешь на русском языке."},
            {"role": "user", "content": prompt}
        ],
        "max_tokens": 200,
        "temperature": 0.8,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        return {"statusCode": e.code, "headers": cors_headers, "body": json.dumps({"error": f"OpenAI error {e.code}", "raw": error_body})}
    except Exception as e:
        return {"statusCode": 500, "headers": cors_headers, "body": json.dumps({"error": str(e)})}

    text = data["choices"][0]["message"]["content"].strip()

    return {
        "statusCode": 200,
        "headers": cors_headers,
        "body": json.dumps({"text": text, "type": text_type, "style": style}),
    }
