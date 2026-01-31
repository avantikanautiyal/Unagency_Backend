
import { parseNotificationContent } from "./notificationUtils";

const testCases = [
    {
        template: "Hey [Name], Good to see you again. [Open Dashboard]",
        variables: { Name: "Sourav" },
        expected: {
            text: "Hey Sourav, Good to see you again.",
            cta: "Open Dashboard"
        }
    },
    {
        template: "Your project [ProjectName] is ready. [View Project]",
        variables: { ProjectName: "Alpha" },
        expected: {
            text: "Your project Alpha is ready.",
            cta: "View Project"
        }
    },
    {
        template: "No variables here. [Click Me]",
        variables: {},
        expected: {
            text: "No variables here.",
            cta: "Click Me"
        }
    },
    {
        template: "Welcome [Name]. Let's roll.",
        variables: { Name: "Jane" },
        expected: {
            text: "Welcome Jane. Let's roll.",
            cta: "" // No CTA
        }
    }
];

console.log("Running Notification Parsing Tests...\n");

let passed = 0;
testCases.forEach((test, index) => {
    const result = parseNotificationContent(test.template, test.variables as Record<string, string>);

    const textMatch = result.text === test.expected.text;
    const ctaMatch = result.cta === test.expected.cta;

    if (textMatch && ctaMatch) {
        console.log(`✅ Test ${index + 1} Passed`);
        passed++;
    } else {
        console.log(`❌ Test ${index + 1} Failed`);
        console.log(`   Template: "${test.template}"`);
        console.log(`   Expected: Text="${test.expected.text}", CTA="${test.expected.cta}"`);
        console.log(`   Got:      Text="${result.text}", CTA="${result.cta}"`);
    }
});

console.log(`\nPassed ${passed} / ${testCases.length} tests.`);
