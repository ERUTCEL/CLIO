import AddDocPanel from '../components/AddDocPanel'

export default function Onboarding({ backend, onComplete }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-8 space-y-6">

        <div className="text-center space-y-1">
          <div className="text-4xl">🔬</div>
          <h1 className="text-2xl font-bold text-gray-900">Research Companion</h1>
          <p className="text-gray-500 text-sm">내 논문 전체를 아는 AI 연구 파트너</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">논문 어디 있어요?</p>
          <AddDocPanel backend={backend} onDone={onComplete} />
        </div>

        <button onClick={onComplete} className="w-full py-2 text-gray-400 text-sm hover:text-gray-600">
          건너뛰기 (나중에 추가)
        </button>

      </div>
    </div>
  )
}
