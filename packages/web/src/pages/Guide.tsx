import { useState } from 'react'
import EpgGrid from '../components/EpgGrid.tsx'
import RecordButton from '../components/RecordButton.tsx'
import { Program } from '../api/client.ts'

export default function Guide() {
  const [selectedProgram, setSelectedProgram] = useState<{
    program: Program
    channelId: string
  } | null>(null)

  const handleProgramSelect = (program: Program, channelId: string) => {
    setSelectedProgram({ program, channelId })
  }

  const handleRecorded = () => {
    // Could refresh the EPG or show a toast notification
    setSelectedProgram(null)
  }

  return (
    <div className="flex flex-col h-full">
      <EpgGrid onProgramSelect={handleProgramSelect} />
      
      {/* Recording Action Panel */}
      {selectedProgram && (
        <div className="border-t border-border bg-surface-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-100 mb-1">
                {selectedProgram.program.title}
              </h3>
              {selectedProgram.program.subtitle && (
                <p className="text-amber-500 text-sm font-medium mb-1">
                  {selectedProgram.program.subtitle}
                </p>
              )}
              <p className="text-gray-400 text-sm font-mono">
                {new Date(selectedProgram.program.startTime).toLocaleString()} - {new Date(selectedProgram.program.endTime).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <RecordButton
                program={selectedProgram.program}
                channelId={selectedProgram.channelId}
                onRecord={handleRecorded}
              />
              <button
                onClick={() => setSelectedProgram(null)}
                className="text-gray-400 hover:text-gray-200 text-xl"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}