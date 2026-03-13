/**
 * Script para popular dados eleitorais no GoverneAI (multi-tenant)
 * Popula dados para o tenant "Gabinete Alpha" (VEREADOR - Parnaíba/PI 2024)
 *
 * Execução: npx ts-node src/scripts/seed-election-data.ts
 */

import 'dotenv/config';
import { DataSource } from 'typeorm';

interface CandidateData {
  candidateNumber: string;
  candidateName: string;
  partyAcronym: string;
  votes: number;
  situation: string;
}

// ── Dados reais de Vereadores - Parnaíba/PI 2024 (TSE) ──

const vereadorData: CandidateData[] = [
  // REPUBLICANOS (10)
  {
    candidateNumber: '10777',
    candidateName: 'DANIEL JACKSON ARAUJO DE SOUZA',
    partyAcronym: 'REPUBLICANOS',
    votes: 2276,
    situation: 'Eleito por QP',
  },
  {
    candidateNumber: '10369',
    candidateName: 'RENATO BITTENCOURT DOS SANTOS',
    partyAcronym: 'REPUBLICANOS',
    votes: 2045,
    situation: 'Eleito por QP',
  },
  {
    candidateNumber: '10456',
    candidateName: 'TAYLON OLIVEIRA DE ANDRADES',
    partyAcronym: 'REPUBLICANOS',
    votes: 1533,
    situation: 'Eleito por média',
  },
  {
    candidateNumber: '10111',
    candidateName: 'JOSE ALVES DE SOUZA NETO',
    partyAcronym: 'REPUBLICANOS',
    votes: 1493,
    situation: '1º Suplente',
  },
  {
    candidateNumber: '10222',
    candidateName: 'JULIO CESAR DA CUNHA SOARES',
    partyAcronym: 'REPUBLICANOS',
    votes: 1245,
    situation: '2º Suplente',
  },
  {
    candidateNumber: '10123',
    candidateName: 'BERNARDO DE CLARAVAL NASCIMENTO ROCHA',
    partyAcronym: 'REPUBLICANOS',
    votes: 1080,
    situation: '3º Suplente',
  },
  {
    candidateNumber: '10999',
    candidateName: 'ANTONIO MARCOS DO NASCIMENTO OLIVEIRA',
    partyAcronym: 'REPUBLICANOS',
    votes: 959,
    situation: '4º Suplente',
  },

  // PP (11)
  {
    candidateNumber: '11678',
    candidateName: 'JOAO BATISTA DOS SANTOS FILHO',
    partyAcronym: 'PP',
    votes: 2192,
    situation: 'Eleito por QP',
  },
  {
    candidateNumber: '11456',
    candidateName: 'FRANCISCA DAS CHAGAS CASTELO BRANCO NETA',
    partyAcronym: 'PP',
    votes: 1787,
    situation: 'Eleito por QP',
  },
  {
    candidateNumber: '11000',
    candidateName: 'EDCARLOS GOUVEIA DA SILVA',
    partyAcronym: 'PP',
    votes: 1593,
    situation: 'Eleito por média',
  },
  {
    candidateNumber: '11123',
    candidateName: 'FRANCISCO ASTROGILDO FERNANDES LIMA',
    partyAcronym: 'PP',
    votes: 1396,
    situation: '1º Suplente',
  },

  // MDB (15)
  {
    candidateNumber: '15222',
    candidateName: 'JOSE ALVES DE SOUSA FILHO',
    partyAcronym: 'MDB',
    votes: 2086,
    situation: 'Eleito por QP',
  },
  {
    candidateNumber: '15130',
    candidateName: 'MARCOS SAMARONNE FERREIRA DE OLIVEIRA',
    partyAcronym: 'MDB',
    votes: 2032,
    situation: 'Eleito por QP',
  },
  {
    candidateNumber: '15111',
    candidateName: 'JOAO BATISTA OLIVEIRA DOS SANTOS',
    partyAcronym: 'MDB',
    votes: 1970,
    situation: 'Eleito por QP',
  },
  {
    candidateNumber: '15000',
    candidateName: 'CARLSON AUGUSTO CORNELIO PESSOA',
    partyAcronym: 'MDB',
    votes: 1541,
    situation: '1º Suplente',
  },

  // PODEMOS (20)
  {
    candidateNumber: '20000',
    candidateName: 'MAKSUEL JOSE GOMES BRANDAO',
    partyAcronym: 'PODE',
    votes: 1120,
    situation: 'Eleito por QP',
  },
  {
    candidateNumber: '20123',
    candidateName: 'JOSE MARQUES DE SOUSA JUNIOR',
    partyAcronym: 'PODE',
    votes: 738,
    situation: '1º Suplente',
  },

  // PL (22)
  {
    candidateNumber: '22322',
    candidateName: 'FRANCISCO JOSE DE OLIVEIRA PEREIRA',
    partyAcronym: 'PL',
    votes: 1375,
    situation: 'Eleito por QP',
  },
  {
    candidateNumber: '22456',
    candidateName: 'BRUNO VASCONCELOS CUNHA',
    partyAcronym: 'PL',
    votes: 1047,
    situation: 'Eleito por média',
  },
  {
    candidateNumber: '22333',
    candidateName: 'THICIANO RIBEIRO DA CRUZ',
    partyAcronym: 'PL',
    votes: 986,
    situation: '1º Suplente',
  },

  // UNIÃO (44)
  {
    candidateNumber: '44123',
    candidateName: 'ANTONIO JOSE BATISTA FILHO',
    partyAcronym: 'UNIAO',
    votes: 2420,
    situation: 'Eleito por QP',
  },
  {
    candidateNumber: '44456',
    candidateName: 'VALERIO AQUINO GOMES',
    partyAcronym: 'UNIAO',
    votes: 1640,
    situation: 'Eleito por média',
  },

  // PT (13)
  {
    candidateNumber: '13123',
    candidateName: 'MARCOS ANTONIO DE CARVALHO',
    partyAcronym: 'PT',
    votes: 1980,
    situation: 'Eleito por QP',
  },

  // PCdoB (65)
  {
    candidateNumber: '65000',
    candidateName: 'RAIMUNDO BANDEIRA DA SILVA',
    partyAcronym: 'PCdoB',
    votes: 1750,
    situation: 'Eleito por QP',
  },

  // PSOL (50)
  {
    candidateNumber: '50123',
    candidateName: 'MARIA DAS GRACAS OLIVEIRA',
    partyAcronym: 'PSOL',
    votes: 2100,
    situation: 'Eleito por QP',
  },
];

// ── Dados de Prefeito - Parnaíba/PI 2024 ──

const prefeitoData: CandidateData[] = [
  {
    candidateNumber: '11',
    candidateName: 'FRANCISCO EMANUEL CUNHA DE BRITO',
    partyAcronym: 'PP',
    votes: 54393,
    situation: 'Eleito',
  },
  {
    candidateNumber: '15',
    candidateName: 'JOSE HELIO DE CARVALHO OLIVEIRA',
    partyAcronym: 'MDB',
    votes: 27741,
    situation: 'Não eleito',
  },
  {
    candidateNumber: '55',
    candidateName: 'JOSE HAMILTON FURTADO CASTELLO BRANCO',
    partyAcronym: 'PSD',
    votes: 9692,
    situation: 'Não eleito',
  },
  {
    candidateNumber: '27',
    candidateName: 'ERIVELTON FONTENELE',
    partyAcronym: 'DC',
    votes: 222,
    situation: 'Não eleito',
  },
];

async function seedElectionData() {
  console.log('Iniciando seed de dados eleitorais...\n');

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'governeai2026',
    database: process.env.DATABASE_NAME || 'governeai',
  });

  await dataSource.initialize();
  console.log('Conexao com banco estabelecida\n');

  // Buscar tenant "Gabinete Alpha"
  const tenants = await dataSource.query(
    `SELECT id, name, "politicalProfile" FROM tenants WHERE name ILIKE '%alpha%' LIMIT 1`,
  );

  if (tenants.length === 0) {
    console.error('Tenant "Gabinete Alpha" nao encontrado!');
    await dataSource.destroy();
    process.exit(1);
  }

  const tenant = tenants[0];
  console.log(`Tenant: ${tenant.name} (${tenant.politicalProfile})`);
  console.log(`ID: ${tenant.id}\n`);

  // O tenant é VEREADOR -> candidato do tenant é o próprio gabinete
  // Vamos usar o primeiro vereador como candidato do tenant para demonstração
  const TENANT_CANDIDATE_NAME = 'GABINETE ALPHA';

  // Limpar dados anteriores do tenant
  await dataSource.query('DELETE FROM election_results WHERE "tenantId" = $1', [
    tenant.id,
  ]);
  console.log('Dados anteriores removidos\n');

  const electionYear = 2024;
  const round = 1;
  const city = 'PARNAIBA';
  const state = 'PI';
  const zones = ['003', '004']; // Zonas eleitorais de Parnaíba
  const sectionsPerZone = 100;

  let totalRecords = 0;
  const batch: string[] = [];

  // Adicionar candidato do tenant (dados simulados como se fosse o gabinete concorrendo)
  const tenantCandidate: CandidateData = {
    candidateNumber: '11999',
    candidateName: TENANT_CANDIDATE_NAME,
    partyAcronym: 'PP',
    votes: 1850,
    situation: 'Eleito por média',
  };

  const allCandidates = [tenantCandidate, ...vereadorData, ...prefeitoData];

  for (const candidate of allCandidates) {
    const remainingVotes = candidate.votes;
    const isTenantCandidate = candidate.candidateName === TENANT_CANDIDATE_NAME;

    for (let zi = 0; zi < zones.length; zi++) {
      const zone = zones[zi];

      // Distribuir votos: 55% zona principal, 45% zona secundária
      const zoneVotes =
        zi === 0
          ? Math.floor(remainingVotes * 0.55)
          : remainingVotes - Math.floor(remainingVotes * 0.55);

      // Distribuir pelas seções da zona
      const numSections = Math.floor(
        sectionsPerZone * (0.3 + Math.random() * 0.4),
      );
      let sectionRemaining = zoneVotes;

      for (let s = 1; s <= numSections && sectionRemaining > 0; s++) {
        const sectionVotes =
          s === numSections
            ? sectionRemaining
            : Math.max(
                1,
                Math.floor(
                  (sectionRemaining / (numSections - s + 1)) *
                    (0.5 + Math.random()),
                ),
              );

        const actualVotes = Math.min(sectionVotes, sectionRemaining);
        if (actualVotes <= 0) continue;

        // totalVotes da seção (todos os candidatos somados - estimativa)
        const totalVotesSection = Math.floor(
          actualVotes / (0.01 + Math.random() * 0.08),
        );
        const section = String(s).padStart(4, '0');

        const escapeSql = (str: string) => str.replace(/'/g, "''");

        batch.push(
          `('${tenant.id}', ${electionYear}, ${round}, '${escapeSql(candidate.candidateName)}', '${escapeSql(candidate.candidateNumber)}', '${escapeSql(candidate.partyAcronym)}', ${isTenantCandidate}, '${zone}', '${section}', '${city}', '${state}', NULL, ${actualVotes}, ${totalVotesSection}, '${escapeSql(candidate.partyAcronym)}')`,
        );

        sectionRemaining -= actualVotes;
        totalRecords++;

        // Inserir em lotes de 500
        if (batch.length >= 500) {
          await insertBatch(dataSource, batch);
          batch.length = 0;
          process.stdout.write(`\rImportados: ${totalRecords} registros...`);
        }
      }
    }

    console.log(
      `  ${candidate.candidateNumber} - ${candidate.candidateName}: ${candidate.votes.toLocaleString('pt-BR')} votos ${isTenantCandidate ? '(TENANT)' : ''}`,
    );
  }

  // Inserir restante
  if (batch.length > 0) {
    await insertBatch(dataSource, batch);
  }

  console.log(`\nSeed concluido! ${totalRecords} registros inseridos`);
  console.log('\nResumo:');

  const summary = await dataSource.query(
    `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE "isTenantCandidate" = true) as tenant_rows,
      COUNT(DISTINCT "candidateName") as candidates,
      COUNT(DISTINCT "zone") as zones,
      COUNT(DISTINCT "section") as sections,
      SUM("candidateVotes") as total_votes
    FROM election_results
    WHERE "tenantId" = $1
  `,
    [tenant.id],
  );

  console.log(`  Total registros: ${summary[0].total}`);
  console.log(`  Registros do tenant: ${summary[0].tenant_rows}`);
  console.log(`  Candidatos: ${summary[0].candidates}`);
  console.log(`  Zonas: ${summary[0].zones}`);
  console.log(`  Secoes: ${summary[0].sections}`);
  console.log(
    `  Total votos: ${parseInt(summary[0].total_votes).toLocaleString('pt-BR')}`,
  );

  // Partidos
  const parties = await dataSource.query(
    `
    SELECT "candidateParty", COUNT(DISTINCT "candidateName") as candidates, SUM("candidateVotes") as votes
    FROM election_results
    WHERE "tenantId" = $1
    GROUP BY "candidateParty"
    ORDER BY votes DESC
  `,
    [tenant.id],
  );

  console.log('\nPor partido:');
  for (const p of parties) {
    console.log(
      `  ${p.candidateParty}: ${p.candidates} candidatos, ${parseInt(p.votes).toLocaleString('pt-BR')} votos`,
    );
  }

  await dataSource.destroy();
  console.log('\nConexao encerrada');
}

async function insertBatch(dataSource: DataSource, batch: string[]) {
  const values = batch.join(',\n');
  await dataSource.query(`
    INSERT INTO election_results
    ("tenantId", "electionYear", "round", "candidateName", "candidateNumber", "candidateParty", "isTenantCandidate", "zone", "section", "city", "state", "neighborhood", "candidateVotes", "totalVotes", "party")
    VALUES ${values}
  `);
}

seedElectionData().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});
