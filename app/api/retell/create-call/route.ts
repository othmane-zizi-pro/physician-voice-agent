import { NextRequest, NextResponse } from 'next/server';
import Retell from 'retell-sdk';
import { getSession } from '@/lib/auth';

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY! });

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    // Build dynamic variables for personalization
    const dynamicVariables: Record<string, string> = {};

    if (session?.userId) {
      // Fetch AI context for returning users
      try {
        const contextRes = await fetch(
          `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/ai-context`,
          {
            headers: {
              cookie: request.headers.get('cookie') || ''
            }
          }
        );
        if (contextRes.ok) {
          const contextData = await contextRes.json();
          if (contextData.context) {
            dynamicVariables.user_context = contextData.context;
          }
        }
      } catch (e) {
        console.error('Failed to fetch AI context:', e);
      }

      if (session.name) {
        dynamicVariables.user_name = session.name;
      }
    }

    // Get IP address for rate limiting
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                      request.headers.get('x-real-ip') ||
                      'unknown';

    const webCallResponse = await retell.call.createWebCall({
      agent_id: process.env.RETELL_AGENT_ID!,
      metadata: {
        user_id: session?.userId || null,
        ip_address: ipAddress,
      },
      retell_llm_dynamic_variables: Object.keys(dynamicVariables).length > 0
        ? dynamicVariables
        : undefined,
    });

    return NextResponse.json({
      accessToken: webCallResponse.access_token,
      callId: webCallResponse.call_id,
    });
  } catch (error) {
    console.error('Failed to create Retell call:', error);
    return NextResponse.json(
      { error: 'Failed to create call' },
      { status: 500 }
    );
  }
}
