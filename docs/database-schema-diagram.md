# Database Schema Diagram

## Multi-League Architecture Overview

This diagram shows the proper multi-league database schema that separates NFL teams (QB sources) from fantasy teams (league participants).

```mermaid
erDiagram
    %% Core User Management
    USERS {
        uuid id PK
        string email
        timestamp created_at
    }

    %% League Management
    LEAGUES {
        uuid id PK
        string name
        integer season
        integer teams_started_per_week
        timestamp draft_at
        uuid created_by FK
        timestamp created_at
    }

    LEAGUE_MEMBERS {
        uuid league_id PK,FK
        uuid user_id PK,FK
        string role "owner|member"
        timestamp joined_at
    }

    %% NFL Teams (QB Sources)
    TEAMS {
        uuid uuid_id PK "New UUID primary key"
        integer id "Legacy integer ID"
        string name "Cleveland, Miami, etc"
        string abbreviation "CLE, MIA, etc"
        jsonb rosters
        timestamp created_at
    }

    %% Fantasy Teams (League Participants)
    FANTASY_TEAMS {
        uuid id PK
        uuid league_id FK
        string team_name "User's team name"
        uuid manager_user_id FK
        timestamp created_at
    }

    %% Fantasy Team Matchups
    LEAGUE_MATCHUPS {
        uuid id PK
        uuid league_id FK
        integer week
        uuid fantasy_team1_id FK
        uuid fantasy_team2_id FK
        timestamp created_at
    }

    %% Fantasy Lineups (Which NFL teams to start)
    FANTASY_LINEUPS {
        uuid id PK
        uuid fantasy_team_id FK
        integer week
        uuid_array active_nfl_teams "Array of NFL team UUIDs"
        boolean is_locked
        timestamp created_at
        timestamp updated_at
    }

    %% Week Management
    WEEKS {
        uuid league_id PK,FK
        integer week_number PK
        timestamp locks_at
        boolean is_locked
        timestamp created_at
    }

    %% Audit Logging
    AUDIT_LOGS {
        uuid id PK
        uuid league_id FK
        uuid user_id FK
        string action
        string entity_type
        uuid entity_id
        jsonb details
        timestamp created_at
    }

    %% Legacy Tables (For Migration Compatibility)
    LINEUPS {
        integer id PK "Legacy table"
        uuid team_uuid_id FK "References teams.uuid_id"
        integer week
        string_array active_qbs "Legacy: NFL team names"
        uuid_array active_qbs_uuid "New: NFL team UUIDs"
        boolean is_locked
        timestamp created_at
    }

    MATCHUPS {
        integer id PK "Legacy table"
        integer week
        uuid team1_uuid_id FK "References teams.uuid_id"
        uuid team2_uuid_id FK "References teams.uuid_id"
        uuid winner_uuid_id FK "References teams.uuid_id"
        timestamp created_at
    }

    %% Relationships
    USERS ||--o{ LEAGUE_MEMBERS : "can join multiple leagues"
    USERS ||--o{ FANTASY_TEAMS : "can manage teams"
    USERS ||--o{ LEAGUES : "can create leagues"

    LEAGUES ||--o{ LEAGUE_MEMBERS : "has members"
    LEAGUES ||--o{ FANTASY_TEAMS : "contains fantasy teams"
    LEAGUES ||--o{ LEAGUE_MATCHUPS : "has matchups"
    LEAGUES ||--o{ WEEKS : "has weeks"
    LEAGUES ||--o{ AUDIT_LOGS : "logs actions"

    FANTASY_TEAMS ||--o{ LEAGUE_MATCHUPS : "participates in matchups (team1)"
    FANTASY_TEAMS ||--o{ LEAGUE_MATCHUPS : "participates in matchups (team2)"
    FANTASY_TEAMS ||--o{ FANTASY_LINEUPS : "sets lineups"

    TEAMS ||--o{ FANTASY_LINEUPS : "NFL teams referenced in lineups"

    %% Legacy relationships (for migration)
    TEAMS ||--o{ LINEUPS : "legacy lineup references"
    TEAMS ||--o{ MATCHUPS : "legacy matchup references"
```

## Key Design Principles

### 🎯 **Clear Separation of Concerns**
- **NFL Teams** (`teams`) - The 32 NFL franchises, shared across all leagues
- **Fantasy Teams** (`fantasy_teams`) - User-created teams within specific leagues
- **Matchups** (`league_matchups`) - Fantasy team vs fantasy team battles
- **Lineups** (`fantasy_lineups`) - Which NFL teams each fantasy team starts

### 🔒 **Multi-League Support**
- Fantasy teams are scoped to specific leagues
- Same user can have different team names in different leagues
- Proper isolation between leagues

### 🚀 **Scalable Architecture**
- UUID primary keys for better distribution
- Clear foreign key relationships
- No redundant winner storage (calculated from scores)

## Table Descriptions

### Core Tables

#### `fantasy_teams`
The actual participants in leagues. Each fantasy team:
- Belongs to exactly one league
- Has a unique name within that league
- Is managed by one user
- Can participate in matchups and set lineups

#### `league_matchups`
Fantasy team vs fantasy team battles:
- No winner_id field (winners calculated from scores)
- Clear references to fantasy teams, not NFL teams
- Proper week-based scheduling

#### `fantasy_lineups`
Which NFL teams each fantasy team starts:
- `active_nfl_teams` - Array of NFL team UUIDs
- Clear naming: these are NFL teams, not QBs or fantasy teams
- Proper foreign key to fantasy team

### Legacy Tables

#### `lineups` & `matchups`
Kept for backward compatibility during migration:
- Will be phased out once new system is stable
- Contains both old (integer) and new (UUID) references
- Bridges old and new architectures

## Views and Functions

The schema includes several views for easy data access:

- `v_fantasy_teams` - Fantasy teams with manager info
- `v_league_matchups` - Matchups with team names and manager details
- `v_fantasy_lineups` - Lineups with NFL team names for display

## Migration Strategy

This schema represents the target state after the proper multi-league migration:

1. **Phase 1**: Convert existing schema to UUID (completed)
2. **Phase 2**: Add new proper tables (fantasy_teams, league_matchups, fantasy_lineups)
3. **Phase 3**: Migrate data from legacy tables to new tables
4. **Phase 4**: Update application code to use new tables
5. **Phase 5**: Deprecate legacy tables (future)

## Benefits

### ✅ **Intuitive Design**
- Table names clearly indicate purpose
- Field names are self-documenting
- Relationships are obvious

### ✅ **Multi-League Ready**
- Proper data isolation
- Scalable to many leagues
- No naming conflicts

### ✅ **Performance Optimized**
- UUID indexes for fast lookups
- Proper foreign keys for query optimization
- Minimal data duplication