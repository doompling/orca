import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import product from '../shared/ether-product.json'

export type EtherProduct = typeof product

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readEtherProductMetadata(value: unknown): EtherProduct | null {
  if (!isRecord(value) || value.etherBuild === undefined) {
    return null
  }
  const marker = value.etherBuild
  if (
    value.name !== product.packageName ||
    !isRecord(marker) ||
    Object.entries(product).some(([key, expected]) => marker[key] !== expected)
  ) {
    throw new Error('Invalid Ether build identity; refusing to use another app profile.')
  }
  return product
}

const identities = new Map<string, EtherProduct | null>()

export function getPackagedEtherProduct(): EtherProduct | null {
  if (!app?.isPackaged || typeof app.getAppPath !== 'function') {
    return null
  }
  const packagePath = join(app.getAppPath(), 'package.json')
  if (identities.has(packagePath)) {
    return identities.get(packagePath) ?? null
  }
  const metadata: unknown = JSON.parse(readFileSync(packagePath, 'utf8'))
  const identity = readEtherProductMetadata(metadata)
  if (!identity && ['Ether', 'ether'].includes(app.getName())) {
    throw new Error('Ether build identity is missing; refusing to use another app profile.')
  }
  identities.set(packagePath, identity)
  return identity
}
