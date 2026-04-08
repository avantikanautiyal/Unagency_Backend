
/**
 * Utility functions for parsing notification content
 */

export interface ParsedNotification {
    title: string;
    body: string;
    ctaText: string;
    ctaLink?: string; // Derived from context, not the template
}

/**
 * Parses notification template strings, replacing variables and extracting CTA
 * @param template The template string (e.g., "Hello [Name]... [Click Here]")
 * @param variables Object containing key-value pairs to replace (e.g., { Name: "John" })
 * @returns Object containing the cleaned body and extracted CTA text
 */
export function parseNotificationContent(
    template: string,
    variables: Record<string, string> = {}
): { text: string; cta: string } {
    let content = template;

    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
        // Regex to match [Key] case-insensitive
        const regex = new RegExp(`\\[${key}\\]`, 'gi');
        content = content.replace(regex, value);
    }

    // Extract CTA -> [CTA Text] at the end of the string usually
    // We look for the last occurrence of something in brackets that might be a CTA
    // The requirement says "cta button text are wrappet in the [] square bracket"

    let cta = "";

    // Match CTA in the final [...] block, allowing trailing spaces/punctuation.
    const ctaRegex = /\s*\[([^\]]+)\]\s*[.!?]?\s*$/;
    const match = content.match(ctaRegex);

    if (match) {
        cta = match[1].trim();
        content = content.replace(ctaRegex, "").trim();
    }

    return {
        text: content,
        cta: cta
    };
}
