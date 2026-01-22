// lib/clipUtils.ts

export interface Exchange {
  index: number;
  physicianText: string;
  docText: string;
}

/**
 * Parses a transcript into exchanges.
 * Each exchange is a physician turn followed by Doc's response.
 *
 * Transcript format:
 * You: first thing physician says
 * Doc: doc's response
 * You: second thing
 * Doc: another response
 */
export function parseTranscriptIntoExchanges(transcript: string): Exchange[] {
  const lines = transcript.split('\n').filter(line => line.trim());
  const exchanges: Exchange[] = [];

  let currentExchange: { physicianLines: string[]; docLines: string[] } | null = null;
  let exchangeIndex = 0;

  for (const line of lines) {
    const isPhysician = line.startsWith('You:');
    const isDoc = line.startsWith('Doc:');
    const content = line.replace(/^(You:|Doc:)\s*/, '').trim();

    if (isPhysician) {
      // If we have a complete exchange (has doc response), save it
      if (currentExchange && currentExchange.docLines.length > 0) {
        exchanges.push({
          index: exchangeIndex,
          physicianText: currentExchange.physicianLines.join(' '),
          docText: currentExchange.docLines.join(' '),
        });
        exchangeIndex++;
      }
      // Start new exchange or add to existing physician turn
      if (!currentExchange || currentExchange.docLines.length > 0) {
        currentExchange = { physicianLines: [content], docLines: [] };
      } else {
        currentExchange.physicianLines.push(content);
      }
    } else if (isDoc && currentExchange) {
      currentExchange.docLines.push(content);
    }
  }

  // Don't forget the last exchange
  if (currentExchange && currentExchange.docLines.length > 0) {
    exchanges.push({
      index: exchangeIndex,
      physicianText: currentExchange.physicianLines.join(' '),
      docText: currentExchange.docLines.join(' '),
    });
  }

  return exchanges;
}
