export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      message: "choichichi hashtag API is running"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 가능합니다."
    });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY가 설정되지 않았습니다."
      });
    }

    const body = req.body || {};
    const topic = String(body.topic || body.keyword || body.text || "").trim();

    if (!topic) {
      return res.status(400).json({
        error: "주제를 입력해 주세요."
      });
    }

    if (topic.length > 300) {
      return res.status(400).json({
        error: "주제는 300자 이내로 입력해 주세요."
      });
    }

    const count = clamp(Number(body.count || 20), 5, 30);
    const platform = String(body.platform || "instagram");
    const mood = String(body.mood || "balanced");
    const goal = String(body.goal || "balanced");

    const prompt = buildPrompt({
      topic,
      platform,
      mood,
      goal,
      count
    });

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: prompt,
        max_output_tokens: 600
      })
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      return res.status(openaiResponse.status).json({
        error: "OpenAI API 호출 실패",
        detail: data
      });
    }

    const raw = extractText(data);
    const hashtags = extractHashtags(raw).slice(0, count);

    if (hashtags.length === 0) {
      return res.status(500).json({
        error: "AI 결과에서 해시태그를 찾지 못했습니다.",
        raw,
        detail: data
      });
    }

    return res.status(200).json({
      success: true,
      hashtags,
      text: hashtags.join(" "),
      raw
    });
  } catch (error) {
    return res.status(500).json({
      error: "서버 처리 중 오류가 발생했습니다.",
      detail: String(error && error.stack ? error.stack : error)
    });
  }
}

function buildPrompt({ topic, platform, mood, goal, count }) {
  return `
너는 한국 SNS 마케팅과 해시태그 추천에 능숙한 전문가야.

아래 조건에 맞는 해시태그를 생성해줘.

주제:
${topic}

플랫폼:
${platform}

분위기:
${mood}

목표:
${goal}

개수:
${count}개

규칙:
- 반드시 #으로 시작
- 설명, 번호, 문장 없이 해시태그만 출력
- 한 줄로 출력
- 한국어 해시태그 중심
- 필요하면 영어 해시태그 3~5개 포함
- 검색량이 큰 태그, 중간 태그, 세부 태그를 섞기
- 너무 광범위한 태그만 반복하지 않기
- 중복 금지
`.trim();
}

function extractText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks = [];

  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (Array.isArray(item.content)) {
        for (const content of item.content) {
          if (typeof content.text === "string") {
            chunks.push(content.text);
          }

          if (content.text && typeof content.text.value === "string") {
            chunks.push(content.text.value);
          }
        }
      }
    }
  }

  return chunks.join(" ").trim();
}

function extractHashtags(text) {
  const matches = String(text || "").match(/#[^\s#]+/g) || [];
  return [...new Set(matches.map((tag) => tag.trim()).filter(Boolean))];
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}
