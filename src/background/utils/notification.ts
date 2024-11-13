
export type NotificationType = "COMMON" | "PROJECT" | "REQUIRMENT" | "TASK"

// interface Notofication {
//     type: NotificationType;
//     title: string;
//     description: string;
// }
export class Notification {
    constructor(public title: string, public description: string, public type: NotificationType) { }
}

