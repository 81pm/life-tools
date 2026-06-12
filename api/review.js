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
      message: "AI Review Generator API"
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

    const product = String(body.product || "").trim();
    const features = String(body.features || "").trim();
    const tone = String(body.tone || "natural").trim();
    const length = String(body.length || "medium").trim();
    const count = Math.min(
      Math.max(Number(body.count || 3), 1),
      10
    );

    if (!product) {
      return res.status(400).json({
        error: "상품명을 입력해주세요."
      });
    }

    const prompt = `
당신은 실제 구매자 후기 작성 전문가입니다.

상품명:
${product}

특징:
${features}

후기 스타일:
${tone}

후기 길이:
${length}

후기 개수:
${count}개

규칙:

- 서로 다른 후기 ${count}개 작성
- 각 후기는 실제 사용자가 작성한 것처럼 자연스럽게 작성
- 광고 문구 금지
- 과장 표현 금지
- 이모지 금지
- 제목 금지
- 번호 금지
- 후기와 후기 사이는 ### 으로 구분

길이 기준

short : 2~3문장
medium : 5~7문장
long : 10문장 이상
`;

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: prompt,
          max_output_tokens: 2000
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "OpenAI API 호출 실패",
        detail: data
      });
    }

    const raw = extractText(data);

    let reviews = raw
      .split("###")
      .map(v => v.trim())
      .filter(Boolean);

    if (!reviews.length) {
      reviews = [raw.trim()].filter(Boolean);
    }

    return res.status(200).json({
      success: true,
      review: reviews[0] || "",
      reviews,
      text: reviews.join("\n\n"),
      count: reviews.length,
      raw
    });

  } catch (error) {
    return res.status(500).json({
      error: "서버 오류",
      detail: String(error)
    });
  }
}

function extractText(data) {
  if (
    typeof data.output_text === "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  const chunks = [];

  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!Array.isArray(item.content)) continue;

      for (const content of item.content) {
        if (typeof content.text === "string") {
          chunks.push(content.text);
        }

        if (
          content.text &&
          typeof content.text.value === "string"
        ) {
          chunks.push(content.text.value);
        }
      }
    }
  }

  return chunks.join("\n").trim();
}