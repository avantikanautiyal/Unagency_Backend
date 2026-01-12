
//         "initiated",
//         "on-hold",
//         "revision",
//         "delivered",
//         "approved",
//         "closed",

export const IN_APP_NOTIFICATION_MESSAGES = {
    PROJECT_PLANNING: "Your project just landed in the universe. It’s blinking, stretching, and waiting for you to guide it like the creative mastermind you are.",
    PROJECT_INITIATED: "We’ve kicked things off — the creative engines are humming, screens are glowing, and your project is officially in motion.",
    PROJECT_DELIVERED: "Your draft is ready! It’s sitting up straight, trying its best to impress you. Go give it a look before its confidence fades.",
    PROJECT_REVISION: "Revisions underway! Your feedback is being treated like sacred scripture. The team is shaping things with extreme attention and slightly too much coffee.",
    PROJECT_APPROVED: "Your final delivery is here! Freshly crafted, neatly packaged, and ready to go out into the world like a proud graduate.",
    PROJECT_CLOSED: "Project complete! Look at you — finishing things like a responsible adult. Your design is ready to shine wherever you put it.",
    // added my me 
    PROJECT_ON_HOLD: "Project on hold! Your project is paused, but don’t worry — it’s still breathing and waiting for your next move.",
    PROJECT_DELAYED: "Project delayed! Your project is running late, but don’t worry — it’s still breathing and waiting for your next move.",


    REQUIRMENT_SUBMITTED: "Your brief just left your desk and landed on ours. It’s stretching, sipping coffee, and preparing to become art.",
    REQUIRMENT_CLOSED: "Your brief just left your desk and landed on ours. It’s stretching, sipping coffee, and preparing to become art.",
    REQUIRMENT_SUBMITTED_FAILED: "Your brief tried its best… and then tripped on the internet cable. Nothing’s lost. Let’s help it stand up and try again.",
    TEAM_INVITATION: "You've been invited to join a team! A new creative world awaits – jump in and start collaborating.",
} as const;

export type InAppNotificationKey = keyof typeof IN_APP_NOTIFICATION_MESSAGES;
