export const NOTIFICATION_CONFIG = {
    SUCCESSFUL_LOGIN: {
        trigger: "Successful login",
        in_app_title: "You’re back, [Name]. Let’s roll.",
        in_app_body: "You’re back inside UNAGENCY.",
        email_subject: "You’re back, [Name]. Let’s roll.",
        email_body: "Hey [Name], Good to see you again. Your creative space missed you — ideas, drafts, and that spark."
    },
    WRONG_PASSWORD: {
        trigger: "Wrong password",
        in_app_title: "Couldn’t log you in, please enter the correct password.",
        in_app_body: "Couldn’t log you in, please enter the correct password.",
        email_subject: "",
        email_body: ""
    },
    PASSWORD_CHANGED: {
        trigger: "Password changed",
        in_app_title: "Password updated. Safe and sound.",
        in_app_body: "Your UNAGENCY password has been changed.",
        email_subject: "Password updated. Safe and sound.",
        email_body: "Hey [Name], Your password’s been updated. Everything went smoothly and it’s now officially updated."
    },
    PASSWORD_RESET_REQUESTED: {
        trigger: "Password reset requested",
        in_app_title: "Reset link sent, check your inbox.",
        in_app_body: "Reset link sent, check your inbox.",
        email_subject: "Reset your UNAGENCY password.",
        email_body: "Hey [Name], Here’s your reset link, live for 15 minutes. Let’s get you back in and rolling."
    },
    EMAIL_VERIFICATION_REQUIRED: {
        trigger: "Email verification required",
        in_app_title: "Verify and unlock UNAGENCY",
        in_app_body: "UNAGENCY access needs one tiny checkbox: verify your email.",
        email_subject: "Verify and unlock UNAGENCY",
        email_body: "Hey [Name], UNAGENCY access needs one tiny checkbox: verify your email."
    },
    EMAIL_VERIFIED: {
        trigger: "Email verified",
        in_app_title: "Verified! You’re officially part of UNAGENCY.",
        in_app_body: "Verified! You’re officially part of UNAGENCY.",
        email_subject: "You’re verified, welcome to the crew.",
        email_body: "Hey [Name], Your email’s verified, your seat’s saved, and the creative runway is clear. Let’s make something wild."
    },
    FIRST_LOGIN: {
        trigger: "First login",
        in_app_title: "Welcome to UNAGENCY, [Name]. Let’s get started.",
        in_app_body: "Let’s set up your UNAGENCY space.",
        email_subject: "Let’s set up your UNAGENCY space.",
        email_body: "Hey [Name], Welcome aboard. This is your new creative HQ. Take a quick tour, we’ll show you where everything lives."
    },
    TOUR_COMPLETED: {
        trigger: "Tour completed",
        in_app_title: "You’re all set. Let’s make something epic.",
        in_app_body: "You’re all set. Let’s make something epic.",
        email_subject: "You’ve unlocked your UNAGENCY workspace.",
        email_body: "Hey [Name], Tour’s done, setup’s complete, now it’s your turn. Start your first project and see how fast things move here."
    },
    TOUR_SKIPPED: {
        trigger: "Tour skipped",
        in_app_title: "No problem. You can always come back later.",
        in_app_body: "No problem. You can always come back later.",
        email_subject: "Skip today, tour tomorrow.",
        email_body: "Hey [Name], You skipped the tour (no pressure). When you’re ready, hit restart, we’ll guide you through like a pro."
    },
    SUBSCRIPTION_REQUIRED: {
        trigger: "Subscription required",
        in_app_title: "Premium zone ahead. Time to unlock it.",
        in_app_body: "Premium zone ahead. Time to unlock it.",
        email_subject: "Unlock your full UNAGENCY experience.",
        email_body: "Hey [Name], You’ve reached the premium features. Upgrade your plan and access all the good stuff."
    },
    BRIEF_SUBMITTED: {
        trigger: "Brief submitted",
        in_app_title: "Brief submitted! We’re on it.",
        in_app_body: "Brief submitted! We’re on it.",
        email_subject: "Your brief just landed in UNAGENCY.",
        email_body: "Hey [Name], Your brief is in and our team’s warming up. Expect progress updates soon. [View Brief]"
    },
    BRIEF_SUBMISSION_FAILED: {
        trigger: "Brief submission failed",
        in_app_title: "Your brief didn’t go through.",
        in_app_body: "Something glitched, try again.",
        email_subject: "Your brief didn’t go through.",
        email_body: "Hey [Name], We hit a tiny snag. Resubmit your brief, it’s all autosaved, nothing lost. [Retry Submission]"
    },
    PAYMENT_SUCCESSFUL: {
        trigger: "Payment successful",
        in_app_title: "Welcome to UNAGENCY.",
        in_app_body: "Boom. You’re officially in.",
        email_subject: "Welcome to UNAGENCY.",
        email_body: "Hey [Name], Your payment’s in and your access is live. You now have full control of your creative world."
    },
    PAYMENT_FAILED: {
        trigger: "Payment failed",
        in_app_title: "Payment issue on your UNAGENCY account.",
        in_app_body: "Payment didn’t land. Let’s fix it.",
        email_subject: "Payment issue on your UNAGENCY account.",
        email_body: "Hey [Name], Your payment didn’t go through, no biggie. Update your card and retry. We’ll hold your spot."
    },
    RENEWAL_UPCOMING: {
        trigger: "Renewal upcoming",
        in_app_title: "Your UNAGENCY plan renews soon.",
        in_app_body: "Heads up! Renewal soon.",
        email_subject: "Your UNAGENCY plan renews soon.",
        email_body: "Hey [Name], Your plan renews shortly. If you’re loving the ride, do nothing. If you’re planning changes, manage it here."
    },
    PLAN_EXPIRED: {
        trigger: "Plan expired",
        in_app_title: "Your UNAGENCY plan expired.",
        in_app_body: "Plan snoozed. Let’s wake it up.",
        email_subject: "Your UNAGENCY plan expired.",
        email_body: "Hey [Name], Your plan took a break, renew to get your tools back and keep your flow going. [Renew Plan]"
    },
    INVOICE_GENERATED: {
        trigger: "Invoice generated",
        in_app_title: "Your UNAGENCY invoice is here.",
        in_app_body: "Your invoice is ready.",
        email_subject: "Your UNAGENCY invoice is here.",
        email_body: "Hey [Name], Your invoice has been generated and is ready for download. Official proof of creativity. [Download Invoice]"
    },
    ORGANIZATION_CREATED: {
        trigger: "Organization created",
        in_app_title: "Your workspace is live.",
        in_app_body: "Your workspace is live.",
        email_subject: "Your UNAGENCY workspace is ready.",
        email_body: "Hey [Name], You just created a workspace, your team’s new creative HQ. Invite your people and get things moving."
    },
    MEMBER_INVITED: {
        trigger: "Member invited",
        in_app_title: "Invite sent. Team’s growing.",
        in_app_body: "Invite sent. Team’s growing.",
        email_subject: "You’ve been invited to UNAGENCY.",
        email_body: "Hey [Invitee], [Name] just invited you to their UNAGENCY workspace. Join the team and start creating together."
    },
    MEMBER_JOINED: {
        trigger: "Member joined",
        in_app_title: "New teammate onboard.",
        in_app_body: "New teammate onboard.",
        email_subject: "New member joined your UNAGENCY workspace.",
        email_body: "Hey [Name], [Member Name] just joined your workspace. Say hey and share the vision. [View Team]"
    },
    MEMBER_REMOVED: {
        trigger: "Member removed",
        in_app_title: "Team update in your UNAGENCY workspace.",
        in_app_body: "One member left the team.",
        email_subject: "Team update in your UNAGENCY workspace.",
        email_body: "Hey [Name], [Member Name] is no longer part of your workspace. Everything else stays right where you left it."
    },
    REMOVED_FROM_WORKSPACE: {
        trigger: "Removed from workspace",
        in_app_title: "Member removed from workspace",
        in_app_body: "You are removed from workspace",
        email_subject: "Member removed from workspace",
        email_body: "Hi [Member Name], Your access to this UNAGENCY workspace has been removed and your permissions have been updated."
    },
    TEAM_LIMIT_REACHED: {
        trigger: "Team limit reached",
        in_app_title: "Team full, time to upgrade.",
        in_app_body: "Team full, time to upgrade.",
        email_subject: "",
        email_body: ""
    },
    NEW_MESSAGE_RECEIVED: {
        trigger: "New message received",
        in_app_title: "You’ve got a new message in UNAGENCY.",
        in_app_body: "New message, your team’s talking.",
        email_subject: "You’ve got a new message in UNAGENCY.",
        email_body: "Hey [Name], Someone sent you a message in your workspace. Jump in to keep the creative momentum alive."
    },
    PROJECT_CREATED: {
        trigger: "Project created",
        in_app_title: "Project created — let’s get to work.",
        in_app_body: "Project created — let’s get to work.",
        email_subject: "Your UNAGENCY project is live.",
        email_body: "Hey [Name], You just created a project, nice move. Add your details and set things in motion. [View Project]"
    },
    PROJECT_STARTED: {
        trigger: "Project started",
        in_app_title: "Project started. Momentum’s on.",
        in_app_body: "Project started. Momentum’s on.",
        email_subject: "Your UNAGENCY project is underway.",
        email_body: "Hey [Name], We’ve kicked things off. Your project’s in production — we’ll update you as things unfold."
    },
    PROJECT_MOVED_TO_REVIEW: {
        trigger: "Project moved to review",
        in_app_title: "Ready for your review.",
        in_app_body: "Ready for your review.",
        email_subject: "Your project’s ready for feedback.",
        email_body: "Hey [Name], Your latest draft’s ready. Take a look and drop your comments — your input fuels the next step."
    },
    PROJECT_MOVED_TO_REVISIONS: {
        trigger: "Project moved to revisions",
        in_app_title: "Revisions in progress.",
        in_app_body: "Revisions in progress.",
        email_subject: "We’re revising your UNAGENCY project.",
        email_body: "Hey [Name], We got your feedback and we’re on it. Expect updated designs soon."
    },
    FINAL_DELIVERY_READY: {
        trigger: "Final delivery ready",
        in_app_title: "Final files ready for you.",
        in_app_body: "Final files ready for you.",
        email_subject: "Your UNAGENCY delivery is ready.",
        email_body: "Hey [Name], Final files are up and waiting. Download them and bring your ideas to life."
    },
    PROJECT_COMPLETED: {
        trigger: "Project completed",
        in_app_title: "Project wrapped, well done.",
        in_app_body: "Project wrapped, well done.",
        email_subject: "Your UNAGENCY project is complete.",
        email_body: "Hey [Name], Your project’s officially complete. Thanks for trusting us with your ideas, we hope it looks even better than you imagined."
    },
    FEATURE_LAUNCH: {
        trigger: "Feature launch",
        in_app_title: "Explore what’s new at UNAGENCY.",
        in_app_body: "New feature drop!",
        email_subject: "Explore what’s new at UNAGENCY.",
        email_body: "Hey [Name], We just launched something fresh. Try it today and make your creative process even smoother."
    },
    LIMITED_OFFER: {
        trigger: "Limited offer",
        in_app_title: "Your exclusive UNAGENCY offer.",
        in_app_body: "Something special’s live.",
        email_subject: "Your exclusive UNAGENCY offer.",
        email_body: "Hey [Name], We’ve unlocked a limited-time offer just for you. Grab it before it fades away."
    }
    ,
    CS_CLIENT_ACTIVATED: {
        trigger: "Client purchased membership",
        in_app_title: "Client membership activated successfully",
        in_app_body: "Client membership activated successfully",
        email_subject: "New client activated",
        email_body: "A client has purchased a membership. Their workspace is now active"
    },
    CS_PAYMENT_SUCCESSFUL: {
        trigger: "Payment successful",
        in_app_title: "Payment confirmed. Services are now live",
        in_app_body: "Payment confirmed. Services are now live",
        email_subject: "Payment successful",
        email_body: "Client payment has been processed successfully and services are active"
    },
    CS_PAYMENT_FAILED: {
        trigger: "Payment failed",
        in_app_title: "Client payment failed. Action required",
        in_app_body: "Client payment failed. Action required",
        email_subject: "Payment failed",
        email_body: "The client’s payment attempt failed. Please follow up to resolve"
    },
    CS_ASSIGNED_TO_CLIENT: {
        trigger: "CS assigned to client",
        in_app_title: "You have been assigned to a new client",
        in_app_body: "You have been assigned to a new client",
        email_subject: "New client assigned",
        email_body: "You have been assigned as the servicing manager for a new client"
    },
    CS_ORG_CREATED: {
        trigger: "Client organisation created",
        in_app_title: "Client organisation has been created",
        in_app_body: "Client organisation has been created",
        email_subject: "Organisation created",
        email_body: "A new client organisation has been created and is ready"
    },
    CS_ORG_UPDATED: {
        trigger: "Client organisation details updated",
        in_app_title: "Client organisation details updated",
        in_app_body: "Client organisation details updated",
        email_subject: "",
        email_body: ""
    },
    CS_ACCOUNT_PAUSED: {
        trigger: "Client account paused due to non-renewal",
        in_app_title: "Client account paused due to subscription non-renewal",
        in_app_body: "Client account paused due to subscription non-renewal",
        email_subject: "Client account paused",
        email_body: "The client account has been paused because the subscription was not renewed. Active work"
    },
    CS_ACCOUNT_RESUMED: {
        trigger: "Client account resumed",
        in_app_title: "Client account has been resumed",
        in_app_body: "Client account has been resumed",
        email_subject: "Client account resumed",
        email_body: "The client account has been resumed and work may continue"
    },
    CS_BRIEF_STARTED: {
        trigger: "Client started brief",
        in_app_title: "Client has started filling the brief",
        in_app_body: "Client has started filling the brief",
        email_subject: "",
        email_body: ""
    },
    CS_BRIEF_PENDING: {
        trigger: "Brief incomplete reminder",
        in_app_title: "Client has not completed the brief",
        in_app_body: "Client has not completed the brief",
        email_subject: "Brief pending",
        email_body: "The client has not completed the brief. A reminder may be required"
    },
    CS_BRIEF_SUBMITTED: {
        trigger: "Client submitted brief",
        in_app_title: "New brief submitted. Review required",
        in_app_body: "New brief submitted. Review required",
        email_subject: "New brief submitted",
        email_body: "A new brief has been submitted by the client. Please review and proceed"
    },
    CS_BRIEF_APPROVED: {
        trigger: "Brief approved by CS",
        in_app_title: "Brief approved. Ready for execution",
        in_app_body: "Brief approved. Ready for execution",
        email_subject: "Brief approved",
        email_body: "The brief has been approved and the project is ready to move forward"
    },
    CS_BRIEF_UPDATED: {
        trigger: "Brief updated by client",
        in_app_title: "Client updated the brief",
        in_app_body: "Client updated the brief",
        email_subject: "Brief updated",
        email_body: "The client has made updates to the brief. Please review changes"
    },
    CS_PROJECT_CREATED: {
        trigger: "Project created",
        in_app_title: "Project created successfully",
        in_app_body: "Project created successfully",
        email_subject: "",
        email_body: ""
    },
    CS_PROJECT_IDLE: {
        trigger: "Project idle",
        in_app_title: "Project has been inactive for some time",
        in_app_body: "Project has been inactive for some time",
        email_subject: "Project idle",
        email_body: "The project has seen no activity for a while. Please review"
    },
    CS_PROJECT_PAUSED: {
        trigger: "Project paused",
        in_app_title: "Project has been paused",
        in_app_body: "Project has been paused",
        email_subject: "Project paused",
        email_body: "The project has been temporarily paused"
    },
    CS_PROJECT_RESUMED: {
        trigger: "Project resumed",
        in_app_title: "Project has been resumed",
        in_app_body: "Project has been resumed",
        email_subject: "Project resumed",
        email_body: "The project has been resumed and work can continue"
    },
    CS_DELIVERY_SENT: {
        trigger: "Project delivery sent to client",
        in_app_title: "Delivery sent to client. Awaiting response",
        in_app_body: "Delivery sent to client. Awaiting response",
        email_subject: "Delivery sent",
        email_body: "Project delivery has been shared with the client"
    },
    CS_PROJECT_DEADLINE: {
        trigger: "Project deadline approaching",
        in_app_title: "Project deadline approaching",
        in_app_body: "Project deadline approaching",
        email_subject: "Project deadline reminder",
        email_body: "The project is nearing its deadline. Please ensure progress is on track"
    },
    CS_PROJECT_COMPLETED: {
        trigger: "Project completed",
        in_app_title: "Project marked as completed",
        in_app_body: "Project marked as completed",
        email_subject: "Project completed",
        email_body: "The project has been completed successfully"
    },
    CS_TASK_CREATED: {
        trigger: "Task created",
        in_app_title: "A new task has been created",
        in_app_body: "A new task has been created",
        email_subject: "",
        email_body: ""
    },
    CS_FEEDBACK_ADDED: {
        trigger: "CS added feedback",
        in_app_title: "Feedback added to the task",
        in_app_body: "Feedback added to the task",
        email_subject: "Feedback added",
        email_body: "Feedback has been added to the task. Resource has been notified"
    },
    CS_TASK_SUBMITTED: {
        trigger: "Resource submitted task",
        in_app_title: "Task submitted for review",
        in_app_body: "Task submitted for review",
        email_subject: "Task submitted",
        email_body: "A resource has submitted a task for review"
    },
    CS_TASK_OVERDUE: {
        trigger: "Task overdue",
        in_app_title: "Task deadline crossed. Follow up required",
        in_app_body: "Task deadline crossed. Follow up required",
        email_subject: "Task overdue",
        email_body: "A task has crossed its deadline. Please follow up"
    },
    CS_TASK_APPROVED: {
        trigger: "Task approved",
        in_app_title: "Task approved successfully",
        in_app_body: "Task approved successfully",
        email_subject: "",
        email_body: ""
    },
    CS_CLIENT_MESSAGE: {
        trigger: "Client sent message",
        in_app_title: "New message from client",
        in_app_body: "New message from client",
        email_subject: "",
        email_body: ""
    },
    CS_CLIENT_INACTIVE: {
        trigger: "Client inactive for 48 hours",
        in_app_title: "Client inactive for 48 hours. Follow-up required",
        in_app_body: "Client inactive for 48 hours. Follow-up required",
        email_subject: "Client follow-up required",
        email_body: "The client has not responded for 48 hours. Please follow up"
    },
    CS_PROJECT_LIMIT_REACHED: {
        trigger: "Client reached project limit",
        in_app_title: "Client has reached project limit",
        in_app_body: "Client has reached the project limit for the [Plan Name] plan.",
        email_subject: "",
        email_body: ""
    },
    CS_UPGRADE_REQUIRED: {
        trigger: "Upgrade required",
        in_app_title: "Upgrade required",
        in_app_body: "Upgrade required to proceed further.",
        email_subject: "",
        email_body: ""
    },
    // Resource Notifications
    RESOURCE_TASK_ASSIGNED: {
        trigger: "Task assigned",
        in_app_title: "A new task has been assigned to you",
        in_app_body: "A new task has been assigned to you",
        email_subject: "New task assigned",
        email_body: "A new task has been assigned to you. Please review the details and begin when ready"
    },
    RESOURCE_FEEDBACK_ADDED: {
        trigger: "CS added feedback",
        in_app_title: "New feedback has been added to your task",
        in_app_body: "New feedback has been added to your task",
        email_subject: "Feedback added",
        email_body: "Client Servicing has added feedback. Please review and update accordingly"
    },
    RESOURCE_TASK_SUBMITTED: {
        trigger: "Task submitted",
        in_app_title: "Task submitted for review",
        in_app_body: "Task submitted for review",
        email_subject: "",
        email_body: ""
    },
    RESOURCE_TASK_REVISION: {
        trigger: "Task sent for revision",
        in_app_title: "Feedback requires revisions",
        in_app_body: "Feedback requires revisions",
        email_subject: "Revision required",
        email_body: "Your task needs revisions. Please review feedback and update"
    },
    RESOURCE_TASK_APPROVED: {
        trigger: "Task approved",
        in_app_title: "Your task has been approved",
        in_app_body: "Your task has been approved",
        email_subject: "Task approved",
        email_body: "Your task has been approved successfully"
    },
    RESOURCE_PRIORITY_CHANGED: {
        trigger: "Task priority changed",
        in_app_title: "Task priority has been updated",
        in_app_body: "Task priority has been updated",
        email_subject: "",
        email_body: ""
    },
    RESOURCE_DEADLINE_APPROACHING: {
        trigger: "Task deadline approaching",
        in_app_title: "Reminder: task deadline approaching",
        in_app_body: "Reminder: task deadline approaching",
        email_subject: "Deadline reminder",
        email_body: "Your task deadline is approaching. Please ensure progress is on track"
    },
    RESOURCE_TASK_OVERDUE: {
        trigger: "Task overdue",
        in_app_title: "The task deadline has passed",
        in_app_body: "The task deadline has passed",
        email_subject: "Task overdue",
        email_body: "The task deadline has passed. Please update status or reach out if blocked"
    },
    RESOURCE_TASK_COMPLETED: {
        trigger: "Task completed",
        in_app_title: "Task marked as completed",
        in_app_body: "Task marked as completed",
        email_subject: "",
        email_body: ""
    }
} as const;

export type NotificationKey = keyof typeof NOTIFICATION_CONFIG;

// Deprecated: kept for backward compatibility until refactor is complete
export const IN_APP_NOTIFICATION_MESSAGES = {
    PROJECT_PLANNING: "Your project just landed in the universe. It’s blinking, stretching, and waiting for you to guide it like the creative mastermind you are.",
    BRIEF_SUBMITTED: NOTIFICATION_CONFIG.BRIEF_SUBMITTED.in_app_body,
    PROJECT_INITIATED: NOTIFICATION_CONFIG.PROJECT_STARTED.in_app_body,
    PROJECT_DELIVERED: NOTIFICATION_CONFIG.PROJECT_MOVED_TO_REVIEW.in_app_body,
    PROJECT_REVISION: NOTIFICATION_CONFIG.PROJECT_MOVED_TO_REVISIONS.in_app_body,
    PROJECT_APPROVED: NOTIFICATION_CONFIG.FINAL_DELIVERY_READY.in_app_body,
    PROJECT_CLOSED: NOTIFICATION_CONFIG.PROJECT_COMPLETED.in_app_body,

    // Kept as is for now as they might not have direct mapping or are internal
    PROJECT_ON_HOLD: "Project on hold! Your project is paused, but don’t worry — it’s still breathing and waiting for your next move.",
    PROJECT_DELAYED: "Project delayed! Your project is running late, but don’t worry — it’s still breathing and waiting for your next move.",

    REQUIRMENT_SUBMITTED: "Your brief just left your desk and landed on ours. It’s stretching, sipping coffee, and preparing to become art.",
    REQUIRMENT_CLOSED: "Your brief just left your desk and landed on ours. It’s stretching, sipping coffee, and preparing to become art.",
    REQUIRMENT_SUBMITTED_FAILED: NOTIFICATION_CONFIG.BRIEF_SUBMISSION_FAILED.in_app_body,
    TEAM_INVITATION: NOTIFICATION_CONFIG.MEMBER_INVITED.in_app_body,

    // Auth & Account
    LOGIN_SUCCESSFUL: NOTIFICATION_CONFIG.SUCCESSFUL_LOGIN.in_app_body,
    PASSWORD_CHANGED: NOTIFICATION_CONFIG.PASSWORD_CHANGED.in_app_body,
    EMAIL_VERIFIED: NOTIFICATION_CONFIG.EMAIL_VERIFIED.in_app_body,
    SUBSCRIPTION_REQUIRED: NOTIFICATION_CONFIG.SUBSCRIPTION_REQUIRED.in_app_body,

    // Billing
    PAYMENT_SUCCESSFUL: NOTIFICATION_CONFIG.PAYMENT_SUCCESSFUL.in_app_body,
    PAYMENT_FAILED: NOTIFICATION_CONFIG.PAYMENT_FAILED.in_app_body,
    RENEWAL_UPCOMING: NOTIFICATION_CONFIG.RENEWAL_UPCOMING.in_app_body,
    PLAN_EXPIRED: NOTIFICATION_CONFIG.PLAN_EXPIRED.in_app_body,
    INVOICE_GENERATED: NOTIFICATION_CONFIG.INVOICE_GENERATED.in_app_body,

    // Organization
    ORG_CREATED: NOTIFICATION_CONFIG.ORGANIZATION_CREATED.in_app_body,
    MEMBER_INVITED: NOTIFICATION_CONFIG.MEMBER_INVITED.in_app_body,
    MEMBER_JOINED: NOTIFICATION_CONFIG.MEMBER_JOINED.in_app_body,
    MEMBER_REMOVED: NOTIFICATION_CONFIG.MEMBER_REMOVED.in_app_body,
    MEMBER_REMOVED_SELF: NOTIFICATION_CONFIG.REMOVED_FROM_WORKSPACE.in_app_body,
    TEAM_LIMIT_REACHED: NOTIFICATION_CONFIG.TEAM_LIMIT_REACHED.in_app_body,

    // Messaging
    NEW_MESSAGE: NOTIFICATION_CONFIG.NEW_MESSAGE_RECEIVED.in_app_body,
    CONNECTION_LOST: "You’re offline, we’ve got your spot.",

    // Marketing
    FEATURE_LAUNCH: NOTIFICATION_CONFIG.FEATURE_LAUNCH.in_app_body,
    LIMITED_OFFER: NOTIFICATION_CONFIG.LIMITED_OFFER.in_app_body,
    PASSWORD_RESET: NOTIFICATION_CONFIG.PASSWORD_RESET_REQUESTED.in_app_body,

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

    // Resource - Task Notifications
    RESOURCE_TASK_ASSIGNED: "A new task has been assigned to you.",
    RESOURCE_FEEDBACK_ADDED: "New feedback has been added to your task.",
    RESOURCE_TASK_SUBMITTED: "Task submitted for review.",
    RESOURCE_TASK_REVISION: "Feedback requires revisions.",
    RESOURCE_TASK_APPROVED: "Your task has been approved.",
    RESOURCE_PRIORITY_CHANGED: "Task priority has been updated.",
    RESOURCE_DEADLINE_APPROACHING: "Reminder: task deadline approaching.",
    RESOURCE_TASK_OVERDUE: "Task deadline has passed.",
    RESOURCE_TASK_COMPLETED: "Task marked as completed.",
} as const;

export type InAppNotificationKey = keyof typeof IN_APP_NOTIFICATION_MESSAGES;
