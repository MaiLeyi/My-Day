import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  images: string[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}

export default function Lightbox(props: Props) {
  const { images, index, onIndexChange, onClose } = props

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1)
      if (event.key === 'ArrowRight' && index < images.length - 1) onIndexChange(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, images.length, onClose, onIndexChange])

  const src = images[index]
  if (!src) return null

  return createPortal(
    <div className="lightbox" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="lb-bar">
        <span>
          {index + 1} / {images.length}
        </span>
        <span className="spacer" />
        <a className="lb-btn" href={src} download={`图片_${index + 1}`} onClick={(e) => e.stopPropagation()}>
          下载
        </a>
        <button className="lb-btn" onClick={onClose} title="关闭（Esc）">
          ✕
        </button>
      </div>
      {index > 0 && (
        <button className="lb-arrow left" onClick={() => onIndexChange(index - 1)} title="上一张（←）">
          ‹
        </button>
      )}
      <img className="lb-img" src={src} alt={`图片 ${index + 1}`} />
      {index < images.length - 1 && (
        <button className="lb-arrow right" onClick={() => onIndexChange(index + 1)} title="下一张（→）">
          ›
        </button>
      )}
    </div>,
    document.body,
  )
}
