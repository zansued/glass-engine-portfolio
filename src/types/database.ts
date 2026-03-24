/**
 * Tipos TypeScript gerados a partir do schema do Supabase
 * Para o projeto Glass Engine Portfolio
 */

/**
 * Tipo para valores JSON armazenados no banco
 * Compatível com o tipo Json do Supabase
 */
export type JsonValue = 
  | string 
  | number 
  | boolean 
  | null 
  | JsonValue[] 
  | { [key: string]: JsonValue }

/**
 * Tipo principal que representa toda a estrutura do banco de dados
 * Gerado a partir do schema 'app_87d33774'
 */
export type Database = {
  public: {
    Tables: {
      users: UsersTable
      portfolios: PortfoliosTable
      sections: SectionsTable
      projects: ProjectsTable
      analytics: AnalyticsTable
      testimonials: TestimonialsTable
      early_access: EarlyAccessTable
    }
    Views: {
      // Views podem ser adicionadas posteriormente
    }
    Functions: {
      // Funções do banco podem ser tipadas aqui
    }
    Enums: {
      // Enums definidos no banco
      user_tier: 'free' | 'pro' | 'enterprise'
      theme_type: 'glass' | 'dark' | 'light' | 'neon'
      section_type: 'hero' | 'about' | 'projects' | 'skills' | 'contact'
      project_status: 'completed' | 'in_progress' | 'planned'
    }
  }
}

export type UsersTable = {
  Row: {
    id: string
    email: string
    hashed_password: string
    tier: Database['public']['Enums']['user_tier']
    full_name: string | null
    avatar_url: string | null
    bio: string | null
    github_url: string | null
    linkedin_url: string | null
    website_url: string | null
    created_at: string
    updated_at: string
    last_login_at: string | null
  }
  Insert: Omit<UsersTable['Row'], 'id' | 'created_at' | 'updated_at'> & {
    id?: string
    created_at?: string
    updated_at?: string
  }
  Update: Partial<UsersTable['Insert']>
}

export type PortfoliosTable = {
  Row: {
    id: string
    user_id: string
    title: string
    theme: Database['public']['Enums']['theme_type']
    custom_css: string | null
    is_published: boolean
    published_url: string | null
    seo_title: string | null
    seo_description: string | null
    view_count: number
    like_count: number
    created_at: string
    updated_at: string
    published_at: string | null
  }
  Insert: Omit<PortfoliosTable['Row'], 'id' | 'created_at' | 'updated_at' | 'view_count' | 'like_count'> & {
    id?: string
    created_at?: string
    updated_at?: string
    view_count?: number
    like_count?: number
  }
  Update: Partial<PortfoliosTable['Insert']>
}

export type SectionsTable = {
  Row: {
    id: string
    portfolio_id: string
    type: Database['public']['Enums']['section_type']
    title: string
    content: JsonValue
    order_index: number
    is_visible: boolean
    background_color: string | null
    text_color: string | null
    glass_intensity: number
    created_at: string
    updated_at: string
  }
  Insert: Omit<SectionsTable['Row'], 'id' | 'created_at' | 'updated_at'> & {
    id?: string
    created_at?: string
    updated_at?: string
  }
  Update: Partial<SectionsTable['Insert']>
}

export type ProjectsTable = {
  Row: {
    id: string
    portfolio_id: string
    title: string
    description: string
    technologies: string[]
    github_url: string | null
    live_url: string | null
    featured_image: string | null
    status: Database['public']['Enums']['project_status']
    start_date: string | null
    end_date: string | null
    order_index: number
    created_at: string
    updated_at: string
  }
  Insert: Omit<ProjectsTable['Row'], 'id' | 'created_at' | 'updated_at'> & {
    id?: string
    created_at?: string
    updated_at?: string
  }
  Update: Partial<ProjectsTable['Insert']>
}

export type AnalyticsTable = {
  Row: {
    id: string
    portfolio_id: string
    event_type: 'view' | 'like' | 'share' | 'click'
    event_data: JsonValue
    user_agent: string | null
    ip_address: string | null
    referrer: string | null
    created_at: string
  }
  Insert: Omit<AnalyticsTable['Row'], 'id' | 'created_at'> & {
    id?: string
    created_at?: string
  }
  Update: Partial<AnalyticsTable['Insert']>
}

export type TestimonialsTable = {
  Row: {
    id: string
    user_id: string
    content: string
    rating: number
    is_approved: boolean
    created_at: string
    updated_at: string
  }
  Insert: Omit<TestimonialsTable['Row'], 'id' | 'created_at' | 'updated_at'> & {
    id?: string
    created_at?: string
    updated_at?: string
  }
  Update: Partial<TestimonialsTable['Insert']>
}

export type EarlyAccessTable = {
  Row: {
    id: string
    email: string
    marketing_consent: boolean
    referral_code: string | null
    status: 'pending' | 'approved' | 'rejected'
    created_at: string
    approved_at: string | null
  }
  Insert: Omit<EarlyAccessTable['Row'], 'id' | 'created_at'> & {
    id?: string
    created_at?: string
  }
  Update: Partial<EarlyAccessTable['Insert']>
}

/**
 * Tipos para respostas de queries com joins
 */
export type PortfolioWithSections = PortfoliosTable['Row'] & {
  sections: SectionsTable['Row'][]
}

export type PortfolioWithProjects = PortfoliosTable['Row'] & {
  projects: ProjectsTable['Row'][]
}

export type FullPortfolio = PortfoliosTable['Row'] & {
  sections: SectionsTable['Row'][]
  projects: ProjectsTable['Row'][]
  user: Pick<UsersTable['Row'], 'full_name' | 'avatar_url' | 'bio'>
}

/**
 * Tipos para operações de filtro e ordenação
 */
export type PortfolioFilters = {
  theme?: Database['public']['Enums']['theme_type']
  is_published?: boolean
  user_id?: string
  search?: string
}

export type ProjectFilters = {
  status?: Database['public']['Enums']['project_status']
  technologies?: string[]
  portfolio_id?: string
}

/**
 * Tipos para o cliente Supabase
 * Nota: Estes tipos são genéricos e serão inferidos pelo Supabase Client
 */
export type SupabaseClient = any
export type SupabaseQueryBuilder = any