
export type NotificationType = "COMMON" | "PROJECT" | "REQUIRMENT" | "TASK" | "SUBSCRIPTION"

// interface Notofication {
//     type: NotificationType;
//     title: string;
//     description: string;
// }
export interface NotificationProps {
    symbol: string;
    title: string;
    description: string;
    type: string;
    action: string;
    actionText: string;
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
    _id?: string;
    id?: string;

    constructor(props: NotificationProps) {
        this.symbol = props.symbol;
        this.title = props.title;
        this.description = props.description;
        this.type = props.type;
        this.action = props.action;
        this.actionText = props.actionText;
        this.id = props._id;
    }
}

// export class Notification {
//     constructor(public title: string, public description: string, public type: NotificationType) { }
// }

