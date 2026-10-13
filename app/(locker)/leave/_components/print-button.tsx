'use client'

import { Printer } from 'lucide-react'
import { buttonClass } from '../../_components/ui'

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass('secondary', 'sm')}>
      <Printer size={14} /> Print
    </button>
  )
}
