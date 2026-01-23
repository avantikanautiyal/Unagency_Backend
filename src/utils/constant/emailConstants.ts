
//         "initiated",
//         "on-hold",
//         "revision",
//         "delivered",
//         "approved",
//         "closed",

export const IN_APP_NOTIFICATION_MESSAGES = {
    PROJECT_PLANNING: "Your project just landed in the universe. It’s blinking, stretching, and waiting for you to guide it like the creative mastermind you are.",
    BRIEF_SUBMITTED: "Your brief is in and our team’s warming up. Expect progress updates soon.", // Used in createProject
    PROJECT_INITIATED: "We’ve kicked things off. Your project’s in production — we’ll update you as things unfold.", // Used for "Project started"
    PROJECT_DELIVERED: "Your latest draft’s ready. Take a look and drop your comments — your input fuels the next step.", // Used for "Project moved to review"
    PROJECT_REVISION: "We got your feedback and we’re on it. Expect updated designs soon.", // Used for "Project moved to revisions"
    PROJECT_APPROVED: "Final files are up and waiting. Download them and bring your ideas to life.", // Used for "Final delivery ready"
    PROJECT_CLOSED: "Your project’s officially complete. Thanks for trusting us with your ideas, we hope it looks even better than you imagined.", // Used for "Project completed"
    // added my me 
    PROJECT_ON_HOLD: "Project on hold! Your project is paused, but don’t worry — it’s still breathing and waiting for your next move.",
    PROJECT_DELAYED: "Project delayed! Your project is running late, but don’t worry — it’s still breathing and waiting for your next move.",


    REQUIRMENT_SUBMITTED: "Your brief just left your desk and landed on ours. It’s stretching, sipping coffee, and preparing to become art.",
    REQUIRMENT_CLOSED: "Your brief just left your desk and landed on ours. It’s stretching, sipping coffee, and preparing to become art.",
    REQUIRMENT_SUBMITTED_FAILED: "Your brief tried its best… and then tripped on the internet cable. Nothing’s lost. Let’s help it stand up and try again.",
    TEAM_INVITATION: "You've been invited to join a team! A new creative world awaits – jump in and start collaborating.",

    // Auth & Account

    LOGIN_SUCCESSFUL: "Good to see you again. Your creative space missed you — ideas, drafts, and that spark.",
    PASSWORD_CHANGED: "Your password’s been updated. Everything went smoothly and it’s now officially updated.",
    EMAIL_VERIFIED: "Your email’s verified, your seat’s saved, and the creative runway is clear. Let’s make something wild.",
    SUBSCRIPTION_REQUIRED: "You’ve reached the premium features. Upgrade your plan and access all the good stuff.",

    // Billing
    PAYMENT_SUCCESSFUL: "Your payment’s in and your access is live. You now have full control of your creative world.",
    PAYMENT_FAILED: "Your payment didn’t go through, no biggie. Update your card and retry. We’ll hold your spot.",
    RENEWAL_UPCOMING: "Your plan renews shortly. If you’re loving the ride, do nothing. If you’re planning changes, manage it here.",
    PLAN_EXPIRED: "Your plan took a break, renew to get your tools back and keep your flow going.",
    INVOICE_GENERATED: "Your invoice has been generated and is ready for download. Official proof of creativity.",

    // Organization
    ORG_CREATED: "You just created a workspace, your team’s new creative HQ. Invite your people and get things moving.", // "Organization created"
    MEMBER_INVITED: "[Name] just invited you to their UNAGENCY workspace. Join the team and start creating together.",
    MEMBER_JOINED: "Hey [Name], [Member Name] just joined your workspace. Say hey and share the vision.",
    MEMBER_REMOVED: "Hey [Name], [Member Name] is no longer part of your workspace. Everything else stays right where you left it.",
    MEMBER_REMOVED_SELF: "Hi [Member Name],\n\nYour access to this UNAGENCY workspace has been removed and your permissions have been updated.",
    TEAM_LIMIT_REACHED: "Team full, time to upgrade.",

    // Messaging
    NEW_MESSAGE: "You’ve got a new message in UNAGENCY.",
    CONNECTION_LOST: "You’re offline, we’ve got your spot.",

    // Marketing
    FEATURE_LAUNCH: "Explore what’s new at UNAGENCY.",
    LIMITED_OFFER: "Your exclusive UNAGENCY offer.",
    PASSWORD_RESET: "Reset your UNAGENCY password.",

    // CS - Client & Organisation Notifications
    CS_CLIENT_MEMBERSHIP_ACTIVATED: "A client has purchased a membership. Their workspace is now active.",
    CS_PAYMENT_SUCCESSFUL: "Client payment has been processed successfully and services are active.",
    CS_PAYMENT_FAILED: "The client's payment attempt failed. Please follow up to resolve.",
    CS_ASSIGNED_TO_CLIENT: "You have been assigned as the servicing manager for a new client.",
    CS_ORG_CREATED: "A new client organisation has been created and is ready.",
    CS_ORG_UPDATED: "Client organisation details have been updated.",
    CS_ACCOUNT_PAUSED: "The client account has been paused because the subscription was not renewed. Active work may be impacted until renewal.",
    CS_ACCOUNT_RESUMED: "The client account has been resumed and work may continue.",

    // CS - Brief & Project Flow
    CS_BRIEF_STARTED: "Client has started filling the brief.",
    CS_BRIEF_INCOMPLETE: "The client has not completed the brief. A reminder may be required.",
    CS_BRIEF_SUBMITTED: "A new brief has been submitted by the client. Please review and proceed.",
    CS_BRIEF_APPROVED: "The brief has been approved and the project is ready to move forward.",
    CS_BRIEF_UPDATED: "The client has made updates to the brief. Please review changes.",
    CS_PROJECT_CREATED: "Project created successfully.",
    CS_PROJECT_IDLE: "The project has seen no activity for a while. Please review.",
    CS_PROJECT_PAUSED: "The project has been temporarily paused.",
    CS_PROJECT_RESUMED: "The project has been resumed and work can continue.",
    CS_PROJECT_DELIVERY_SENT: "Project delivery has been shared with the client.",
    CS_PROJECT_DEADLINE_APPROACHING: "The project is nearing its deadline. Please ensure progress is on track.",
    CS_PROJECT_COMPLETED: "The project has been completed successfully.",

    // CS - Task & Resource Management
    CS_TASK_CREATED: "A new task has been created.",
    CS_FEEDBACK_ADDED: "Feedback has been added to the task. Resource has been notified.",
    CS_TASK_SUBMITTED: "A resource has submitted a task for review.",
    CS_TASK_OVERDUE: "A task has crossed its deadline. Please follow up.",
    CS_TASK_APPROVED: "Task approved successfully.",

    // CS - Client Activity & Risk
    CS_CLIENT_MESSAGE: "New message from client.",
    CS_CLIENT_INACTIVE: "The client has not responded for 48 hours. Please follow up.",
} as const;

export type InAppNotificationKey = keyof typeof IN_APP_NOTIFICATION_MESSAGES;
