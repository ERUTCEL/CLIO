import AddDocPanel from '../components/AddDocPanel'

export default function Onboarding({ backend, onComplete }) {
  return (
    <div className="min-h-screen bg-[#f6f6f2] flex items-center justify-center p-6">
      <div className="grid w-full max-w-5xl overflow-hidden border border-[#d8dbe1] bg-white shadow-2xl md:grid-cols-[0.85fr_1.15fr]">

        <div className="bg-[#151a23] p-8 text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#2dd4bf] text-sm font-bold text-[#0f1720]">
            RC
          </div>
          <h1 className="mt-8 text-3xl font-bold">Research Companion</h1>
          <p className="mt-3 text-sm leading-7 text-[#c7d0dc]">
            Add papers and notes, then turn them into contribution gaps, project risks, and next-step decisions.
          </p>

          <div className="mt-8 grid gap-2 text-xs text-[#d7dee8]">
            {['Evidence-first answers', 'Visual diagram parsing', 'Conversation memory'].map(item => (
              <div key={item} className="rounded-md border border-[#384150] bg-[#1f2631] px-3 py-2">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5 p-8">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#697386]">First setup</div>
            <p className="mt-1 text-lg font-semibold text-[#171717]">Add your research materials</p>
          </div>

          <AddDocPanel backend={backend} onDone={onComplete} />

          <button onClick={onComplete} className="w-full py-2 text-sm text-[#697386] hover:text-[#171717]">
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
