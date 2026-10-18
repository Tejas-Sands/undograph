// Test-only provider: production Workflows never import these responses.
export function syntheticAI(input: unknown) {
  const messages = (input as { messages: { content: string }[] }).messages
  const user = messages.at(-1)!.content
  const data = JSON.parse(user.split('Artifacts (JSON data):\n')[1].split('\nThe previous')[0])
  if (!Array.isArray(data)) {
    if (data.category === 'document') return { response: JSON.stringify({ status: 'supported', summary: data.text, quotes: [data.text] }), usage: { prompt_tokens: 30, completion_tokens: 20 } }
    const quote = data.text.match(/Change-of-mind returns are accepted within (\d+) days of delivery\./)?.[0]
    return { response: JSON.stringify({ status: 'supported', returnWindowDays: Number(quote.match(/(\d+) days/)[1]), evidenceQuote: quote }), usage: { prompt_tokens: 30, completion_tokens: 20 } }
  }
  const source = data.find((artifact: { kind: string }) => artifact.kind === 'source')
  if (source?.body.category === 'document') {
    return { response: JSON.stringify({ decision: 'answered', text: source.body.text, citations: [source.id], reviewRequired: true }), usage: { prompt_tokens: 40, completion_tokens: 25 } }
  }
  const assessment = data.find((artifact: { kind: string }) => artifact.kind === 'assessment')
  const decision = assessment?.body.decision ?? 'account-help'
  return { response: JSON.stringify({ decision, text: decision === 'account-help' ? 'Choose Forgot password on the sign-in page.' : `Your request is ${decision} under the supplied policy.`, citations: [source.id], reviewRequired: true }), usage: { prompt_tokens: 40, completion_tokens: 25 } }
}
