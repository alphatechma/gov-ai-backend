import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { SystemModule } from '../core/modules/system-module.entity';
import { User } from '../core/users/user.entity';
import { ModuleCategory, PoliticalProfile, UserRole } from '../shared/enums';

const ALL_PROFILES = Object.values(PoliticalProfile);

const LEGISLATIVE_PROFILES = [
  PoliticalProfile.VEREADOR,
  PoliticalProfile.DEPUTADO_ESTADUAL,
  PoliticalProfile.DEPUTADO_FEDERAL,
  PoliticalProfile.SENADOR,
];

const EXECUTIVE_PROFILES = [
  PoliticalProfile.PREFEITO,
  PoliticalProfile.VICE_PREFEITO,
  PoliticalProfile.GOVERNADOR,
  PoliticalProfile.VICE_GOVERNADOR,
  PoliticalProfile.SECRETARIO,
];

const CEAP_PROFILES = [
  PoliticalProfile.DEPUTADO_ESTADUAL,
  PoliticalProfile.DEPUTADO_FEDERAL,
  PoliticalProfile.SENADOR,
];

const SYSTEM_MODULES: Partial<SystemModule>[] = [
  // CORE (sempre ativos)
  { key: 'dashboard', name: 'Dashboard', category: ModuleCategory.CORE, icon: 'LayoutDashboard', availableFor: [], isCore: true, isAddon: false },
  { key: 'users', name: 'Gestão de Usuários', category: ModuleCategory.CORE, icon: 'Users', availableFor: [], isCore: true, isAddon: false },
  { key: 'settings', name: 'Configurações', category: ModuleCategory.CORE, icon: 'Settings', availableFor: [], isCore: true, isAddon: false },
  { key: 'audit', name: 'Auditoria', category: ModuleCategory.CORE, icon: 'Shield', availableFor: [], isCore: true, isAddon: false },

  // ELEITORAL
  { key: 'voters', name: 'Gestão de Eleitores', category: ModuleCategory.ELEITORAL, icon: 'UserCheck', availableFor: ALL_PROFILES, isCore: false, isAddon: false },
  { key: 'leaders', name: 'Lideranças', category: ModuleCategory.ELEITORAL, icon: 'UserPlus', availableFor: ALL_PROFILES, isCore: false, isAddon: false },
  { key: 'heatmap', name: 'Mapa de Calor', category: ModuleCategory.ELEITORAL, icon: 'Map', availableFor: ALL_PROFILES, isCore: false, isAddon: false },
  { key: 'election-analysis', name: 'Análise Eleitoral', category: ModuleCategory.ELEITORAL, icon: 'BarChart3', availableFor: ALL_PROFILES, isCore: false, isAddon: false },

  // GABINETE
  { key: 'visits', name: 'Visitas', category: ModuleCategory.GABINETE, icon: 'MapPin', availableFor: ALL_PROFILES, isCore: false, isAddon: false },
  { key: 'help-records', name: 'Gabinete Social', category: ModuleCategory.GABINETE, icon: 'HeartHandshake', availableFor: ALL_PROFILES, isCore: false, isAddon: false },
  { key: 'staff', name: 'Equipe', category: ModuleCategory.GABINETE, icon: 'Briefcase', availableFor: ALL_PROFILES, isCore: false, isAddon: false },
  { key: 'executive-requests', name: 'Pedidos ao Executivo', category: ModuleCategory.GABINETE, icon: 'FileText', availableFor: LEGISLATIVE_PROFILES, isCore: false, isAddon: false },

  // GESTAO
  { key: 'tasks', name: 'Tarefas / Kanban', category: ModuleCategory.GESTAO, icon: 'KanbanSquare', availableFor: ALL_PROFILES, isCore: false, isAddon: false },
  { key: 'agenda', name: 'Agenda', category: ModuleCategory.GESTAO, icon: 'Calendar', availableFor: ALL_PROFILES, isCore: false, isAddon: false },

  // LEGISLATIVO
  { key: 'projects', name: 'Projetos de Lei', category: ModuleCategory.LEGISLATIVO, icon: 'ScrollText', availableFor: LEGISLATIVE_PROFILES, isCore: false, isAddon: false },
  { key: 'bills', name: 'Proposições', category: ModuleCategory.LEGISLATIVO, icon: 'FileStack', availableFor: LEGISLATIVE_PROFILES, isCore: false, isAddon: false },
  { key: 'amendments', name: 'Emendas', category: ModuleCategory.LEGISLATIVO, icon: 'Landmark', availableFor: LEGISLATIVE_PROFILES, isCore: false, isAddon: false },
  { key: 'voting-records', name: 'Votações', category: ModuleCategory.LEGISLATIVO, icon: 'Vote', availableFor: LEGISLATIVE_PROFILES, isCore: false, isAddon: false },

  // FINANCEIRO
  { key: 'ceap', name: 'Cota Parlamentar', category: ModuleCategory.FINANCEIRO, icon: 'Wallet', availableFor: CEAP_PROFILES, isCore: false, isAddon: false },

  // POLITICO
  { key: 'political-contacts', name: 'Rede Política', category: ModuleCategory.POLITICO, icon: 'Network', availableFor: ALL_PROFILES, isCore: false, isAddon: false },

  // COMUNICACAO
  { key: 'chat', name: 'Chat Interno', category: ModuleCategory.COMUNICACAO, icon: 'MessageSquare', availableFor: ALL_PROFILES, isCore: false, isAddon: false },
  { key: 'whatsapp', name: 'WhatsApp CRM', category: ModuleCategory.COMUNICACAO, icon: 'MessageCircle', availableFor: ALL_PROFILES, isCore: false, isAddon: true },

  // INTELIGENCIA
  { key: 'ai', name: 'Assistente IA', category: ModuleCategory.INTELIGENCIA, icon: 'Bot', availableFor: ALL_PROFILES, isCore: false, isAddon: true },
  { key: 'reports', name: 'Relatórios', category: ModuleCategory.INTELIGENCIA, icon: 'FileBarChart', availableFor: ALL_PROFILES, isCore: false, isAddon: false },
];

export async function runSeed(dataSource: DataSource) {
  const moduleRepo = dataSource.getRepository(SystemModule);
  const userRepo = dataSource.getRepository(User);

  // Seed system modules
  for (const mod of SYSTEM_MODULES) {
    const existing = await moduleRepo.findOne({ where: { key: mod.key } });
    if (!existing) {
      await moduleRepo.save(moduleRepo.create(mod));
    }
  }

  console.log(`Seeded ${SYSTEM_MODULES.length} system modules`);

  // Seed super admin
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@governeai.com';
  const existingAdmin = await userRepo.findOne({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await userRepo.save(
      userRepo.create({
        name: process.env.ADMIN_NAME || 'Super Admin',
        email: adminEmail,
        password: hashedPassword,
        role: UserRole.SUPER_ADMIN,
        active: true,
      }),
    );

    console.log(`Super admin created: ${adminEmail}`);
  }
}
