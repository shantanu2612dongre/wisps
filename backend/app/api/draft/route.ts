import { NextResponse } from 'next/server';
import { DraftAgent, DraftAgentInput } from '../../../../agents/DraftAgent';

const draftAgent = new DraftAgent();

export async function POST(req: Request) {
  try {
    const body: DraftAgentInput = await req.json();

    if (!body.intent || !body.userQuery || !body.context) {
      return NextResponse.json(
        { error: 'Missing required fields: intent, userQuery, context' },
        { status: 400 }
      );
    }

    const result = await draftAgent.generateDraft(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json(result.data, { status: 200 });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Invalid JSON payload or internal error' },
      { status: 500 }
    );
  }
}
