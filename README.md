# Prakria Direct Backend API
## 📧 Email Sending

The API automatically sends emails on certain important events in the system, to keep clients and service managers informed.

### When Are Emails Sent?

- **Welcome Email:**  
  When a user signs in for the first time, a welcome email is sent to their registered email address.

- **Client Assignment:**  
  If a client is assigned to a Service person (Relationship Manager), an email notification is sent to the assigned Service person.

- **Subscription Confirmation:**  
  When a customer takes a subscription, a confirmation email is sent to the client.

- **Client Creates Brief:**  
  If a client creates a brief, an email notification is sent to their assigned Service Manager.

- **Service Manager Creates Project:**  
  When a Service Manager creates a project, an email is sent to the client (if the client has an email address on file).

> For all these scenarios, the system uses the email routines described in the codebase to generate and send the relevant emails automatically.

If you need to customize email content or handle additional events, see `src/utils/emailsender/` and the respective background workers in `src/background/workers/`.
