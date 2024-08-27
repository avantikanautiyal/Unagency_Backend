export class ApiResponse {
  success: boolean;
  constructor(
    public statusCode: number,
    private data: unknown,
    private message = "Success"
  ) {
    this.success = this.statusCode < 400;
  }
}

