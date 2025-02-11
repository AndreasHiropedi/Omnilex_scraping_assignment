import { chromium } from "playwright";
import * as fs from "fs";

const URL = "https://www.planalto.gov.br/ccivil_03/Leis/2002/L10406.htm";

// Define structure of the JSON file (for scraping)
interface Article {
    articleCitation: string;
    articleContent: string;
    sections: string[];
}

async function scrape() {

    // Set up chromium headless browser and navigate to target URL
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(URL);
 
    // Initialize arrays to keep track of hierarchy of sections 
    // as well as the individual items added to the JSON file after scraping
    let sections: string[] = [];
    let articles: Article[] = [];

    // Retrieve all content and split it line by line
    const content = await page.locator("body").innerText();
    const lines = content.split("\n");

    let currentSections: string[] = []; // Active section hierarchy
    let accumulating = false; // Flag to indicate that we're collecting multi-line section titles
    
    for (const line of lines) {
        const trimmed = line.trim();

        // Detect major section headers (PARTE, LIVRO, TÍTULO, CAPÍTULO)
        const sectionMatch = trimmed.match(
            /^(P\s*A\s*R\s*T\s*E|L\s*I\s*V\s*R\s*O|T\s*Í\s*T\s*U\s*L\s*O|C\s*A\s*P\s*Í\s*T\s*U\s*L\s*O)|(S\s*e\s*ç\s*ã\s*o)|(S\s*u\s*b\s*s\s*e\s*ç\s*ã\s*o)\s+/i
        );

        if (sectionMatch) {
            const sectionType = sectionMatch[0].replace(/\s+/g, ""); // Remove all spaces to determine the section type

            // Finish accumulating the previous section
            if (accumulating && currentSections.length > 0) {
                currentSections[currentSections.length - 1] = currentSections[currentSections.length - 1].trim();
            }

            // Normalize the section title for PARTE
            let normalizedTitle = trimmed;
            if (/^PARTE/i.test(sectionType)) {
                // Step 1: Remove spaces between the letters of "PARTE" and retain one space after "PARTE"
                normalizedTitle = trimmed.replace(/(P)\s*(A)\s*(R)\s*(T)\s*(E)\s+/i, "$1$2$3$4$5 ");
                // Step 2: Normalize the rest of the title (e.g., "E S P E C I A L" -> "ESPECIAL")
                normalizedTitle = normalizedTitle.replace(/(PARTE)\s+([A-Z])(?:\s*([A-Z]))*/gi, (match, p1, p2, p3) => {
                    // p1 = "PARTE", p2 = first letter after "PARTE", p3 = subsequent letters
                    // Combine all letters after "PARTE" into a single word
                    const restOfWord = match.slice(p1.length + 1).replace(/\s+/g, "");
                    return `${p1} ${restOfWord}`;
                });
            } else {
                // For other sections, normalize spaces as before
                normalizedTitle = trimmed.replace(/\s+/g, " ");
            }

            // Update hierarchy based on section type
            if (/^PARTE/i.test(sectionType)) {
                currentSections = [normalizedTitle]; // Use the normalized title for PARTE
            } else if (/^LIVRO/i.test(sectionType)) {
                currentSections = [currentSections[0], normalizedTitle];
            } else if (/^TÍTULO/i.test(sectionType)) {
                currentSections = [currentSections[0], currentSections[1], normalizedTitle];
            } else if (/^CAPÍTULO/i.test(sectionType)) {
                currentSections = [
                    currentSections[0],
                    currentSections[1],
                    currentSections[2],
                    normalizedTitle,
                ];
            } else if (/^Seção/i.test(sectionType)) {
                currentSections = [
                    currentSections[0],
                    currentSections[1],
                    currentSections[2],
                    currentSections[3],
                    normalizedTitle,
                ];
            } else if (/^Subseção/i.test(sectionType)) {
                currentSections = [
                    currentSections[0],
                    currentSections[1],
                    currentSections[2],
                    currentSections[3],
                    currentSections[4],
                    normalizedTitle,
                ];
            }

            sections = [...currentSections]; // Store current hierarchy
            accumulating = true; // Start accumulating additional text for this section
            continue; // Move to the next line
        }

        // Accumulate extra section details (e.g., "DAS PESSOAS" after "LIVRO I")
        if (accumulating && trimmed !== "" && !/^Art\./.test(trimmed)) {
            currentSections[currentSections.length - 1] += " " + trimmed.replace(/\s+/g, " ");
            sections = [...currentSections];
            continue;
        }

        // Stop accumulating when we hit an article or empty line
        if (trimmed === "" || /^Art\./.test(trimmed)) {
            accumulating = false;
        }
    
        // Identify articles
        const articleMatch = trimmed.match(/^(Art\. \d+[ºª]?[-\w]*)\.?\s*/);
        if (articleMatch) {
            const articleCitation = articleMatch[1];
            const articleContent = trimmed.replace(/^(Art\. \d+[ºª]?[-\w]*)\.?\s*/, "").trim();

            if (!/revogado|revogada/i.test(articleContent)) {
                articles.push({
                    articleCitation,
                    articleContent,
                    sections: [...sections], // Store current sections
                });
            }
        }
    }
    
    //
    await browser.close();

    // Saving to custom JSON file
    fs.writeFileSync("civil_code.json", JSON.stringify(articles, null, 2));
    console.log("Scraping complete.");
}

scrape();