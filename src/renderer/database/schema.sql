CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT DEFAULT 'default.png',
    bio TEXT,
    role TEXT DEFAULT 'user',
    date_inscription DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
);
CREATE TABLE IF NOT EXISTS user_follows (
    follower_id INTEGER,
    following_id INTEGER,
    date_follow DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS animes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre_ar TEXT NOT NULL,
    titre_en TEXT,
    titre_jp TEXT,
    synopsis_ar TEXT,
    poster_url TEXT,
    banner_url TEXT,
    format TEXT,
    statut TEXT,
    studio TEXT,
    season TEXT,
    year INTEGER,
    jour_sortie TEXT,
    note_imdb REAL,
    age_rating TEXT,
    total_episodes INTEGER,
    duree_episode INTEGER,
    vues INTEGER DEFAULT 0,
    favoris INTEGER DEFAULT 0,
    date_ajout DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_ar TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS anime_genres (
    anime_id INTEGER,
    genre_id INTEGER,
    PRIMARY KEY (anime_id, genre_id),
    FOREIGN KEY (anime_id) REFERENCES animes(id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS anime_tags (
    anime_id INTEGER,
    tag_id INTEGER,
    PRIMARY KEY (anime_id, tag_id),
    FOREIGN KEY (anime_id) REFERENCES animes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS relations_anime (
    anime_id INTEGER,
    related_anime_id INTEGER,
    relation_type TEXT,
    PRIMARY KEY (anime_id, related_anime_id),
    FOREIGN KEY (anime_id) REFERENCES animes(id),
    FOREIGN KEY (related_anime_id) REFERENCES animes(id)
);
CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anime_id INTEGER NOT NULL,
    numero INTEGER NOT NULL,
    titre_ar TEXT,
    description TEXT,
    is_filler INTEGER DEFAULT 0,
    date_sortie DATETIME,
    vues INTEGER DEFAULT 0,
    FOREIGN KEY (anime_id) REFERENCES animes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS serveurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER,
    nom_serveur TEXT,
    qualite TEXT,
    langue TEXT,
    url_video TEXT NOT NULL,
    FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS subtitles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER,
    langue TEXT,
    url_subtitle TEXT,
    FOREIGN KEY (episode_id) REFERENCES episodes(id)
);
CREATE TABLE IF NOT EXISTS favoris (
    user_id INTEGER,
    anime_id INTEGER,
    date_ajout DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, anime_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (anime_id) REFERENCES animes(id)
);
CREATE TABLE IF NOT EXISTS user_list (
    user_id INTEGER,
    anime_id INTEGER,
    statut TEXT CHECK(statut IN ('watching','completed','plan_to_watch','dropped')),
    episodes_vus INTEGER DEFAULT 0,
    note_user INTEGER CHECK(note_user BETWEEN 0 AND 10),
    PRIMARY KEY (user_id, anime_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (anime_id) REFERENCES animes(id)
);
CREATE TABLE IF NOT EXISTS historique_lecture (
    user_id INTEGER,
    episode_id INTEGER,
    temps_arret INTEGER,
    date_visionnage DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, episode_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (episode_id) REFERENCES episodes(id)
);
CREATE TABLE IF NOT EXISTS commentaires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    episode_id INTEGER,
    parent_id INTEGER,
    contenu TEXT NOT NULL,
    date_post DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (episode_id) REFERENCES episodes(id),
    FOREIGN KEY (parent_id) REFERENCES commentaires(id)
);
CREATE TABLE IF NOT EXISTS commentaire_likes (
    user_id INTEGER,
    commentaire_id INTEGER,
    PRIMARY KEY (user_id, commentaire_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (commentaire_id) REFERENCES commentaires(id)
);
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    message TEXT,
    est_lu INTEGER DEFAULT 0,
    date_notif DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS signalements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    serveur_id INTEGER,
    raison TEXT,
    date_signalement DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (serveur_id) REFERENCES serveurs(id)
);
CREATE TABLE IF NOT EXISTS recommandations (
    anime_id INTEGER,
    recommended_anime_id INTEGER,
    score REAL,
    PRIMARY KEY (anime_id, recommended_anime_id),
    FOREIGN KEY (anime_id) REFERENCES animes(id),
    FOREIGN KEY (recommended_anime_id) REFERENCES animes(id)
);
CREATE INDEX IF NOT EXISTS idx_user_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_anime_titre ON animes(titre_ar);
CREATE INDEX IF NOT EXISTS idx_episode_anime ON episodes(anime_id);
CREATE INDEX IF NOT EXISTS idx_comment_episode ON commentaires(episode_id);
CREATE INDEX IF NOT EXISTS idx_serveur_episode ON serveurs(episode_id);
CREATE INDEX IF NOT EXISTS idx_genre_nom ON genres(nom_ar);
CREATE TRIGGER IF NOT EXISTS update_favoris_count_add AFTER INSERT ON favoris BEGIN UPDATE animes SET favoris = favoris + 1 WHERE id = NEW.anime_id; END;
CREATE TRIGGER IF NOT EXISTS update_favoris_count_remove AFTER DELETE ON favoris BEGIN UPDATE animes SET favoris = favoris - 1 WHERE id = OLD.anime_id; END;
