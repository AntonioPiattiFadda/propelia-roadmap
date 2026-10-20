import { describe, expect, it } from 'vitest'
import { PESO_MAXIMO_VIDEO, problemaDelVideo } from './videoPresentacion'

describe('problemaDelVideo', () => {
  it('acepta un mp4 dentro del límite', () => {
    expect(problemaDelVideo({ name: 'a.mp4', type: 'video/mp4', size: 1000 })).toBeNull()
    expect(problemaDelVideo({ name: 'a.mp4', type: '', size: 1000 })).toBeNull()
  })
  it('rechaza otro formato y el que pesa de más', () => {
    expect(problemaDelVideo({ name: 'a.mov', type: 'video/quicktime', size: 1000 })).not.toBeNull()
    expect(problemaDelVideo({ name: 'a.mp4', type: 'video/mp4', size: PESO_MAXIMO_VIDEO + 1 })).not.toBeNull()
  })
})
