import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { ScenarioForm } from '../src/components/ScenarioForm'

test('live setup asks for the visitor’s details instead of preselecting a fictional workspace', () => {
  const html = renderToStaticMarkup(<ScenarioForm busy={false} ready={true} onCreate={async () => {}} onDemo={async () => {}} />)
  expect(html.match(/<input[^>]+id="workspace-name"[^>]+value="([^"]*)"/)?.[1]).toBe('')
  expect(html.match(/<textarea[^>]+id="source-0-text"[^>]*>(.*?)<\/textarea>/s)?.[1]).toBe('')
  expect(html.match(/<textarea[^>]+id="question-0"[^>]*>(.*?)<\/textarea>/s)?.[1]).toBe('')
})
