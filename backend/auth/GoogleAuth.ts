import { google } from "googleapis";

export class GoogleAuth {
  private oauth2Client: any;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/gmail.readonly"
      ],
      prompt: "consent"
    });
  }

  async verifyToken(code: string): Promise<any> {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    
    const oauth2 = google.oauth2({
      auth: this.oauth2Client,
      version: 'v2'
    });
    const userInfo = await oauth2.userinfo.get();
    
    return {
      tokens,
      user: userInfo.data
    };
  }
}
