
export const connection = {
    host: process.env.REDIES_HOST! as string,
    port: parseInt(process.env.REDIES_PORT!),
    password: process.env.REDIES_PASSWORD! as string,
}