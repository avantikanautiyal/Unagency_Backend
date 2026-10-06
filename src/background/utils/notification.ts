
export type NotificationType = "COMMON" | "PROJECT" | "REQUIRMENT" | "TASK" | "SUBSCRIPTION"

export interface NotificationProps {
    symbol: string;
    title: string;
    description: string;
    type: string;
    action: string;
    actionText: string;
    eventKey?: string;
    notificationType?: string;
    userState?: string;
    tone?: string;
    conversionOpportunity?: string;
    secondaryAction?: { text: string; action: string };
    category?: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    dedupeKey?: string;
    channels?: string[];
    _id?: string;
    id?: string;
}
export class Notification {
    symbol: string;
    title: string;
    description: string;
    type: string;
    action: string;
    actionText: string;
    eventKey?: string;
    notificationType?: string;
    userState?: string;
    tone?: string;
    conversionOpportunity?: string;
    secondaryAction?: { text: string; action: string };
    category?: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    dedupeKey?: string;
    channels?: string[];
    _id?: string;
    id?: string;

    constructor(props: NotificationProps) {
        this.symbol = props.symbol;
        this.title = props.title;
        this.description = props.description;
        this.type = props.type;
        this.action = props.action;
        this.actionText = props.actionText;
        this.eventKey = props.eventKey;
        this.notificationType = props.notificationType;
        this.userState = props.userState;
        this.tone = props.tone;
        this.conversionOpportunity = props.conversionOpportunity;
        this.secondaryAction = props.secondaryAction;
        this.category = props.category;
        this.entityType = props.entityType;
        this.entityId = props.entityId;
        this.metadata = props.metadata;
        this.dedupeKey = props.dedupeKey;
        this.channels = props.channels;
        this.id = props._id;
    }
}

