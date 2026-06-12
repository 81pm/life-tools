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

    const {
      product = "",
      feature = "",
      tone = "natural",
      length = "medium"
    } = req.body || {};

    if (!product.trim()) {
      return res.status(400).json({
        error: "상품명을 입력해주세요."
      });
    }

    const prompt = `
당신은 실제 구매자처럼 자연스러운 상품 후기를 작성하는 전문가입니다.

상품명:
${product}

특징:
${feature}

톤:
${tone}

길이:
${length}

조건:
- 광고처럼 보이지 않게 작성
- 실제 사용 후기처럼 작성
- 과장 표현 금지
- 이모지 사용 금지
- 한국어로 작성
- 제목 없이 본문만 작성

길이 기준:
short = 2~3문장
medium = 5~7문장
long = 10문장 이상
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
          max_output_tokens: 1000
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

    const review = extractText(data);

    return res.status(200).json({
      success: true,
      review
    });
  } catch (error) {
    return res.status(500).json({
      error: "서버 오류",
      detail: String(error)
    });
  }
}

function extractText(data) {
  if (typeof data.output_text === "string") {
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