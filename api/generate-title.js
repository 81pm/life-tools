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
      message: "choichichi title API is running"
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
        error: "주제 또는 키워드를 입력해 주세요."
      });
    }

    if (topic.length > 300) {
      return res.status(400).json({
        error: "주제는 300자 이내로 입력해 주세요."
      });
    }

    const count = clamp(Number(body.count || 10), 3, 15);
    const platform = String(body.platform || "블로그").trim();
    const style = String(body.style || "SEO 최적화형").trim();
    const tone = String(body.tone || "자연스럽고 대중적인 말투").trim();
    const memo = String(body.memo || "").trim().slice(0, 300);

    const prompt = buildPrompt({
      topic,
      platform,
      style,
      tone,
      memo,
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
    const titles = extractTitles(raw).slice(0, count);

    if (titles.length === 0) {
      return res.status(500).json({
        error: "AI 결과에서 제목을 찾지 못했습니다.",
        raw,
        detail: data
      });
    }

    return res.status(200).json({
      success: true,
      titles,
      text: titles.join("\n"),
      raw
    });
  } catch (error) {
    return res.status(500).json({
      error: "서버 처리 중 오류가 발생했습니다.",
      detail: String(error && error.stack ? error.stack : error)
    });
  }
}

function buildPrompt({ topic, platform, style, tone, memo, count }) {
  return `
너는 한국어 SEO와 클릭률 높은 제목 작성에 능숙한 카피라이터야.

아래 조건에 맞는 제목을 생성해줘.

주제 또는 키워드:
${topic}

플랫폼:
${platform}

제목 스타일:
${style}

말투:
${tone}

추가 조건:
${memo || "없음"}

개수:
${count}개

규칙:
- 설명, 인사말, 부가 문장 없이 제목만 출력
- 제목은 한 줄에 하나씩 출력
- 번호를 붙여도 되지만 제목 외 설명은 쓰지 않기
- 한국어 제목 중심
- 플랫폼에 맞는 길이와 톤 사용
- 과장 광고처럼 보이는 표현은 피하기
- 같은 구조의 제목을 반복하지 않기
- 검색 유입에 도움이 되는 핵심 키워드를 자연스럽게 포함하기
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

function extractTitles(text) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*•\d.)\]]+\s*/, "").trim())
    .map((line) => line.replace(/^['\"]|['\"]$/g, "").trim())
    .filter(Boolean)
    .filter((line) => !/^제목\s*[:：]?$/i.test(line));

  return [...new Set(lines)];
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}
