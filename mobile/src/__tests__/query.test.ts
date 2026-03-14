import { QK } from '../lib/query';

describe('QK (query key factory)', () => {
  it('search returns ["search", q]', () => {
    expect(QK.search('sol')).toEqual(['search', 'sol']);
  });

  it('lineage returns ["lineage", mint]', () => {
    expect(QK.lineage('So1abc')).toEqual(['lineage', 'So1abc']);
  });

  it('lineageGraph returns ["lineageGraph", mint]', () => {
    expect(QK.lineageGraph('mint123')).toEqual(['lineageGraph', 'mint123']);
  });

  it('solTrace returns ["solTrace", mint]', () => {
    expect(QK.solTrace('mintX')).toEqual(['solTrace', 'mintX']);
  });

  it('deployer returns ["deployer", address]', () => {
    expect(QK.deployer('addr1')).toEqual(['deployer', 'addr1']);
  });

  it('cartel returns ["cartel", deployer]', () => {
    expect(QK.cartel('dep1')).toEqual(['cartel', 'dep1']);
  });

  it('compare returns ["compare", a, b]', () => {
    expect(QK.compare('mintA', 'mintB')).toEqual(['compare', 'mintA', 'mintB']);
  });

  it('globalStats returns ["globalStats"]', () => {
    expect(QK.globalStats()).toEqual(['globalStats']);
  });

  it('health returns ["health"]', () => {
    expect(QK.health()).toEqual(['health']);
  });

  it('me returns ["me", key]', () => {
    expect(QK.me('my-api-key')).toEqual(['me', 'my-api-key']);
  });

  it('watches returns ["watches", key]', () => {
    expect(QK.watches('my-api-key')).toEqual(['watches', 'my-api-key']);
  });

  it('different inputs produce different cache keys (no collisions)', () => {
    expect(QK.lineage('mintA')).not.toEqual(QK.lineage('mintB'));
    expect(QK.compare('a', 'b')).not.toEqual(QK.compare('b', 'a'));
    expect(QK.lineage('x')).not.toEqual(QK.lineageGraph('x'));
  });
});
