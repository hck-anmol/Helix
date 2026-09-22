export class DirectiveParser {
    // Basic wrapper for future expansions
    static parseJson(text: string): any {
        const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleaned);
    }
}
