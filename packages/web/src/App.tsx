import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.tsx'
import Guide from './pages/Guide.tsx'
import Recordings from './pages/Recordings.tsx'
import Schedule from './pages/Schedule.tsx'
import Status from './pages/Status.tsx'
import Settings from './pages/Settings.tsx'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Guide />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/recordings" element={<Recordings />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/status" element={<Status />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App