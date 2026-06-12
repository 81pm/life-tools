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
      message: "choichichi nickname API is running"
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
    const keyword = String(body.keyword || body.topic || body.text || "").trim();

    if (!keyword) {
      return res.status(400).json({
        error: "키워드를 입력해 주세요."
      });
    }

    if (keyword.length > 100) {
      return res.status(400).json({
        error: "키워드는 100자 이내로 입력해 주세요."
      });
    }

    const count = clamp(Number(body.count || 20), 5, 30);
    const style = String(body.style || "balanced");
    const language = String(body.language || "mixed");
    const purpose = String(body.purpose || "general");

    const prompt = buildPrompt({
      keyword,
      style,
      language,
      purpose,
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
        max_output_tokens: 700
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
    const nicknames = extractNicknames(raw).slice(0, count);

    if (nicknames.length === 0) {
      return res.status(500).json({
        error: "AI 결과에서 닉네임을 찾지 못했습니다.",
        raw,
        detail: data
      });
    }

    return res.status(200).json({
      success: true,
      nicknames,
      text: nicknames.join("\n"),
      raw
    });
  } catch (error) {
    return res.status(500).json({
      error: "서버 처리 중 오류가 발생했습니다.",
      detail: String(error && error.stack ? error.stack : error)
    });
  }
}

function buildPrompt({ keyword, style, language, purpose, count }) {
  return `
너는 게임, SNS, 유튜브, 블로그 닉네임을 잘 만드는 닉네이밍 전문가야.

아래 조건에 맞는 닉네임을 ${count}개 생성해줘.

키워드:
${keyword}

사용 목적:
${purpose}

스타일:
${style}

언어:
${language}

규칙:
- 한 줄에 닉네임 하나씩 출력
- 번호, 설명, 따옴표, 불릿 기호 없이 닉네임만 출력
- 중복 금지
- 너무 긴 닉네임 금지
- 실제 서비스에서 사용할 수 있을 만큼 자연스럽게 만들기
- 욕설, 선정적 표현, 혐오 표현, 개인정보처럼 보이는 표현 금지
- 한글 닉네임은 2~8자 정도로 자연스럽게 만들기
- 영문 닉네임은 4~16자 정도로 자연스럽게 만들기
- 키워드를 그대로 반복하지 말고 의미를 살려 변형하기
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

  return chunks.join("\n").trim();
}

function extractNicknames(text) {
  return [...new Set(
    String(text || "")
      .split(/\r?\n/)
      .map((line) =>
        line
          .trim()
          .replace(/^\d+[\).\-\s]*/, "")
          .replace(/^[-*•]\s*/, "")
          .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
          .trim()
      )
      .filter(Boolean)
      .filter((name) => name.length <= 30)
  )];
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}