import { chromium } from "playwright";
import * as fs from "fs";

const URL = "https://www.planalto.gov.br/ccivil_03/Leis/2002/L10406.htm";

interface Article {
  articleCitation: string;
  articleContent: string;
  sections: string[];
}

async function scrapeCivilCode() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(URL);

  let sections: string[] = [];
  let articles: Article[] = [];

  const content = await page.locator("body").innerText();
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Identify sections (PARTE, LIVRO, TÍTULO, CAPÍTULO)
    if (/^(PARTE|LIVRO|TÍTULO|CAPÍTULO)/i.test(trimmed)) {
      sections.push(trimmed);
    }

    // Identify articles (Art. X - ...)
    const articleMatch = trimmed.match(/^(Art\. \d+)[^a-zA-Z0-9]/);
    if (articleMatch) {
      const articleCitation = articleMatch[1];
      const articleContent = trimmed.replace(articleCitation, "").trim();

      // Ignore revoked articles
      if (!/revogado|revogada/i.test(articleContent)) {
        articles.push({
          articleCitation,
          articleContent,
          sections: [...sections], // Save section hierarchy
        });
      }
    }
  }

  await browser.close();

  // Save to JSON file
  fs.writeFileSync("brazilian_civil_code.json", JSON.stringify(articles, null, 2));
  console.log("Scraping complete. Data saved to brazilian_civil_code.json");
}

scrapeCivilCode();
