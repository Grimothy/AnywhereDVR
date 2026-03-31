import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EpgGrid from '../components/EpgGrid.tsx'
import ProgramDetailPanel from '../components/ProgramDetailPanel.tsx'
import { Program, getRules, Rule } from '../api/client.ts'

export default function Guide() {
  const navigate = useNavigate()
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null)
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [existingRules, setExistingRules] = useState<Rule[]>([])
  const [rulesLoaded, setRulesLoaded] = useState(false)

  const handleChannelClick = (channelId: string) => {
    navigate(`/channels?channelId=${channelId}`)
  }

  const handleProgramSelect = async (program: Program, channelId: string) => {
    setSelectedProgram(program)
    setSelectedChannelId(channelId)

    // Load rules once to check for existing series passes
    if (!rulesLoaded) {
      try {
        const rules = await getRules()
        setExistingRules(rules)
        setRulesLoaded(true)
      } catch {
        // non-fatal — we just won't show existing rule badges
      }
    }
  }

  const dismiss = () => {
    setSelectedProgram(null)
    setSelectedChannelId(null)
  }

  return (
    <div className="flex flex-col h-full">
      <EpgGrid
        onProgramSelect={handleProgramSelect}
        onChannelClick={handleChannelClick}
        selectedProgramId={selectedProgram?.id}
      />

      {selectedProgram && selectedChannelId && (
        <ProgramDetailPanel
          program={selectedProgram}
          channelId={selectedChannelId}
          existingRules={existingRules}
          onRuleCreated={(rule) => setExistingRules((prev) => [...prev, rule])}
          onDismiss={dismiss}
        />
      )}
    </div>
  )
}
