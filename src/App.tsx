import React, { useState, useEffect, useMemo } from 'react';
import type { FC } from 'react';
import { initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    doc, 
    addDoc, 
    onSnapshot, 
    query, 
    deleteDoc, 
    updateDoc, 
    writeBatch,
    Timestamp,
    orderBy,
    limit,
    getDocs,
    setLogLevel
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { Lock, Unlock, PlusCircle, Trash2, Crown, Users, Trophy, Gamepad2, History, Pencil, LayoutGrid, Info, PlayCircle, Archive, ArchiveRestore, RefreshCw, LogOut, Newspaper, Medal, AlertTriangle, BarChart2, Bomb, PiggyBank } from 'lucide-react';

// --- Types TypeScript ---
interface Player {
    id: string;
    name: string;
    imageUrl?: string;
    totalScore: number;
    totalChipsAmassed?: number;
    secondPlaceCount?: number;
    zeroChipCount?: number;
    firstBloodCount?: number;
    invincibleStreak?: number;
    ventreMouCount?: number;
    seasonWins?: number;
    consecutiveSeasonWins?: number;
    consecutiveGamesStreak?: number;
}

interface PlayerWithStats extends Player {
    gamesPlayed: number;
    wins: number;
    rank?: number;
}

interface GamePlayer {
    playerId: string;
    name: string;
    chipCount: number;
    score: number;
    rank: number;
}

interface Game {
    id:string;
    seasonId: string;
    date: Timestamp;
    players: GamePlayer[];
}

interface Season {
    id: string;
    name: string;
    imageUrl?: string;
    endDate: Timestamp;
    prize: string;
    isActive: boolean;
    isClosed: boolean;
    finalLeaderboard?: PlayerWithStats[];
}

interface Achievement {
    id: string;
    name: string;
    description: string;
    emoji: string;
    type: 'permanent' | 'saisonnier';
    isSecret?: boolean; 
    newsPhrase: (playerName: string, details?: any) => string;
    lossPhrase?: (playerName: string, newHolderName: string) => string;
}

interface PlayerAchievement {
    id: string;
    playerId: string;
    achievementId: string;
    unlockedAt: Timestamp;
}

interface NewsItem {
    id: string;
    text: string;
    createdAt: Timestamp;
}

// --- Utility Functions ---
const formatNumber = (num: number | undefined | null) => {
    if (num === null || num === undefined) return 0;
    return new Intl.NumberFormat('fr-FR').format(num);
};

// --- Achievements Configuration ---
const achievementsList: Achievement[] = [
    { id: 'veteran', name: 'Le Vétéran', description: 'Participer à 10 parties (toutes saisons confondues).', emoji: '🎖️', type: 'permanent', newsPhrase: (p) => `🎖️ ${p} est devenu un Vétéran des tables de poker en participant à 10 parties !` },
    { id: 'conqueror', name: 'Le Conquérant', description: 'Être le joueur avec le plus de victoires (1ère place) durant la saison en cours.', emoji: '👑', type: 'saisonnier', newsPhrase: (p) => `👑 ${p} s'empare du titre de Conquérant de la saison !`, lossPhrase: (p, n) => `👑 ${p} a perdu son titre de Conquérant au profit de ${n} !` },
    { id: 'red_lantern', name: 'La Lanterne Rouge', description: 'Être le joueur avec le plus de dernières places durant la saison en cours.', emoji: '😥', type: 'saisonnier', newsPhrase: (p) => `😥 ${p} est la nouvelle Lanterne Rouge de la saison...`, lossPhrase: (p, n) => `😥 ${p} a passé le flambeau de la Lanterne Rouge à ${n} !` },
    { id: 'pillar', name: 'Le Pilier', description: 'Participer à 25 parties (toutes saisons).', emoji: '🏛️', type: 'permanent', newsPhrase: (p) => `🏛️ Avec 25 parties à son actif, ${p} est officiellement un Pilier de la ligue !` },
    { id: 'legend', name: 'La Légende', description: 'Participer à 50 parties (toutes saisons).', emoji: '🗿', type: 'permanent', newsPhrase: (p) => `🗿 Une légende vivante ! ${p} vient de terminer sa 50ème partie !` },
    { id: 'poulidor', name: 'Le Poulidor', description: 'Terminer 10 fois à la deuxième place.', emoji: '🥈', type: 'permanent', newsPhrase: (p) => `🥈 ${p} rejoint le club très fermé des Poulidor avec 10 deuxièmes places !` },
    { id: 'holed_pocket', name: 'La Poche Percée', description: 'Terminer 10 parties avec un tapis de 0 jeton.', emoji: '🕳️', type: 'permanent', newsPhrase: (p) => `🕳️ ${p} prouve sa générosité en terminant sa 10ème partie sans aucun jeton. Quel grand seigneur !` },
    { id: 'eternal_second', name: "L'Éternel Second", description: 'Être le joueur avec le plus de deuxièmes places sur la saison.', emoji: '🥈', type: 'saisonnier', newsPhrase: (p) => `🥈 ${p} prend la tête du classement des deuxièmes places cette saison.` },
    { id: 'kamikaze', name: 'Le Kamikaze', description: 'Être le joueur qui termine le plus souvent avec 0 jeton sur la saison.', emoji: '💥', type: 'saisonnier', newsPhrase: (p) => `💥 ${p} prend la tête du classement des "tapis-volant" avec le plus de sorties à 0 jeton.` },
    { id: 'assidu', name: "L'Assidu", description: 'Être le joueur présent au plus de parties cette saison.', emoji: '🏃', type: 'saisonnier', newsPhrase: (p) => `🏃 ${p} prouve son assiduité et prend la tête du nombre de participations !`},
    { id: 'metronome', name: "Le Métronome", description: 'Détenir la plus longue série de participations consécutives cette saison.', emoji: '📅', type: 'saisonnier', newsPhrase: (p) => `📅 Comme une horloge, ${p} prend la tête de la plus longue série de participations consécutives !`},
    { id: 'champion', name: 'Le Champion', description: 'Gagner une saison en terminant à la 1ère place du classement.', emoji: '🏆', type: 'permanent', newsPhrase: (p, details) => `🏆 ${p} est sacré Champion de la saison "${details.seasonName}" !` },
    { id: 'double_champion', name: 'Le Double', description: 'Gagner 2 saisons.', emoji: '🏆🏆', type: 'permanent', newsPhrase: (p) => `🏆🏆 Impressionnant ! ${p} remporte sa deuxième saison !` },
    { id: 'back_to_back', name: 'Le Back-to-Back', description: 'Gagner 2 saisons de suite.', emoji: '🔁🏆', type: 'permanent', newsPhrase: (p) => `🔁🏆 Le doublé ! ${p} remporte deux saisons consécutives !` },
    { id: 'dynasty', name: 'La Dynastie', description: 'Gagner 3 saisons.', emoji: '👑👑👑', type: 'permanent', newsPhrase: (p) => `👑👑👑 ${p} établit une véritable dynastie avec 3 saisons remportées !` },
    { id: 'emperor', name: "L'Empereur", description: 'Gagner 4 saisons.', emoji: '🏰', type: 'permanent', newsPhrase: (p) => `🏰 ${p} n'est plus un simple roi, c'est un Empereur avec 4 titres !` },
    { id: 'poker_god', name: 'Le Dieu du Poker', description: 'Gagner 5 saisons.', emoji: '🌟', type: 'permanent', newsPhrase: (p) => `🌟 Il est au-dessus du commun des mortels. Saluez ${p}, le nouveau Dieu du Poker !` },
    { id: 'serial_killer', name: 'Le Tueur en Série', description: "Gagner une partie d'au moins 5 joueurs en étant le seul survivant.", emoji: '🔪', type: 'permanent', newsPhrase: (p) => `🔪 Tel un prédateur, ${p} a éliminé tous ses adversaires pour finir seul maître à bord !` },
    { id: 'evening_millionaire', name: "Le Millionnaire (d'un soir)", description: 'Terminer une partie avec un tapis de plus de 80 000 jetons.', emoji: '💰', type: 'permanent', newsPhrase: (p, details) => `💰 ${p} a fait sauter la banque et termine la partie avec ${formatNumber(details.chipCount)} jetons !` },
    { id: 'magnate', name: 'Le Magnat (d\'un soir)', description: 'Terminer une partie avec un tapis de plus de 130 000 jetons.', emoji: '💎', type: 'permanent', newsPhrase: (p, details) => `💎 Stratosphérique ! ${p} finit avec un tapis de ${formatNumber(details.chipCount)} jetons et rentre dans la légende !` },
    { id: 'golden_boy', name: 'Le Golden Boy', description: 'Amasser 500 000 jetons au total de toutes les parties.', emoji: '✨', type: 'permanent', newsPhrase: (p) => `✨ ${p} devient un Golden Boy en dépassant les 500 000 jetons amassés en carrière !` },
    { id: 'millionaire', name: 'Le Millionnaire', description: 'Amasser 1 000 000 de jetons au total de toutes les parties.', emoji: '🤑', type: 'permanent', newsPhrase: (p) => `🤑 Incroyable ! ${p} est désormais Millionnaire en jetons, avec plus d'un million amassé en carrière !` },
    { id: 'survivor', name: 'Le Survivant', description: "Finir dernier des survivants, dans une partie d'au moins 6 joueurs, avec un tapis entre 1 et 3000 jetons.", emoji: '🧗', type: 'permanent', newsPhrase: (p) => `🧗 ${p} s'est accroché à la vie comme personne et termine la partie en mode Survivant !` },
    { id: 'first_blood', name: 'Le Premier Sang', description: 'Être le premier joueur éliminé 5 fois.', emoji: '🩸', type: 'permanent', newsPhrase: (p) => `🩸 ${p} a un talent certain pour ouvrir les hostilités, il a versé le Premier Sang pour la 5ème fois !` },
    { id: 'invincible', name: "L'Invincible", description: 'Jouer 8 parties de suite sans jamais finir dernier.', emoji: '💪', type: 'permanent', newsPhrase: (p) => `💪 Quelle régularité ! ${p} vient d'enchaîner 8 parties sans jamais finir dernier !` },
    { id: 'soft_belly', name: 'Le Ventre Mou', description: 'Terminer 5 fois exactement au milieu du classement (ex: 3e/5, 4e/7).', emoji: '🇨🇭', type: 'permanent', newsPhrase: (p) => `🇨🇭 Ni dans les sommets, ni dans les abysses, ${p} maîtrise l'art de la neutralité et rejoint le club du Ventre Mou.` },
    { id: 'the_bubble', name: 'La Bulle', description: "Être le dernier joueur éliminé avant le vainqueur (finir 2ème) 8 fois.", emoji: '🫧', type: 'permanent', newsPhrase: (p) => `🫧 Si près du but... ${p} est passé maître dans l'art de faire la bulle avec une 8ème deuxième place !` },
    { id: 'precise', name: 'Le Précis', description: "Terminer une partie avec un tapis qui est un multiple parfait de 10 000.", emoji: '🎯', type: 'permanent', newsPhrase: (p) => `🎯 En plein dans le mille ! ${p} termine avec un compte de jetons parfaitement rond.`},
    { id: 'collector', name: 'Le Collectionneur', description: "Terminer une partie avec un tapis contenant trois chiffres identiques (ex: 77 700).", emoji: '🎰', type: 'permanent', newsPhrase: (p) => `🎰 Jackpot ! ${p} a aligné les chiffres pour un finish de Collectionneur.`}
];

const firebaseConfig = {
  apiKey: "AIzaSyCEUi2n6f44JwoC64hZ0OqdWfsw-_C-qkU",
  authDomain: "poker-score-8eef5.firebaseapp.com",
  projectId: "poker-score-8eef5",
  storageBucket: "poker-score-8eef5.appspot.com",
  messagingSenderId: "521443160023",
  appId: "1:521443160023:web:1c16df12d73b269bd6a592"
};
const ADMIN_PASSWORD = 'pokeradmin';
const APP_VERSION = "4.0.1";

const app: FirebaseApp = initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
setLogLevel('debug');

const appId = 'default-poker-app'; 

const formatDate = (timestamp: Timestamp | undefined, format: 'long' | 'short' = 'long') => {
    if (!timestamp) return '';
    const date = new Date(timestamp.seconds * 1000);
    if(format === 'short') {
        return date.toISOString().split('T')[0];
    }
    return date.toLocaleDateString('fr-FR', {
        year: 'numeric', month: 'long', day: 'numeric'
    });
};

// --- UI Components ---
const ConfirmationModal: FC<{ show: boolean; onClose: () => void; onConfirm: () => void; title: string; children: React.ReactNode; confirmText?: string; confirmColor?: "red" | "blue" }> = ({ show, onClose, onConfirm, title, children, confirmText = "Confirmer", confirmColor = "red" }) => {
    if (!show) return null;
    const colorClasses = { red: "bg-red-600 hover:bg-red-500", blue: "bg-blue-600 hover:bg-blue-500" };
    return <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4"><div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md border border-gray-700"><h3 className="text-xl font-bold text-white mb-4">{title}</h3><div className="text-gray-300 mb-6">{children}</div><div className="flex justify-end gap-4"><button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition-colors">Annuler</button><button onClick={onConfirm} className={`text-white font-bold py-2 px-4 rounded-md transition-colors ${colorClasses[confirmColor]}`}>{confirmText}</button></div></div></div>;
};
const AlertNotification: FC<{ message: string; show: boolean; type?: 'info' | 'error' | 'success' }> = ({ message, show, type = 'info' }) => {
    if (!show) return null;
    const colors = { info: 'bg-yellow-500 text-gray-900', error: 'bg-red-500 text-white', success: 'bg-green-500 text-white' };
    return <div className={`fixed top-5 right-5 md:top-20 md:right-5 font-semibold py-3 px-5 rounded-lg shadow-lg z-50 animate-pulse ${colors[type]}`}><p>{message}</p></div>;
};
const PlayerCard: FC<{ player: PlayerWithStats; onRemove: (player: PlayerWithStats) => void; onEdit: (player: PlayerWithStats) => void; onViewProfile: (playerId: string) => void; isAdmin: boolean }> = ({ player, onRemove, onEdit, onViewProfile, isAdmin }) => (
    <div className="bg-gray-800 p-3 sm:p-4 rounded-lg flex items-center justify-between shadow-lg hover:bg-gray-700 transition-all duration-200">
        <div onClick={() => onViewProfile(player.id)} className="flex items-center space-x-3 sm:space-x-4 cursor-pointer flex-grow">
            <img src={player.imageUrl || `https://placehold.co/60x60/1f2937/ffffff?text=${player.name.charAt(0)}`} alt={player.name} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-indigo-500 object-cover" onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => { e.currentTarget.onerror = null; e.currentTarget.src = `https://placehold.co/60x60/1f2937/ffffff?text=${player.name.charAt(0)}` }}/>
            <div>
                <p className="text-md sm:text-lg font-semibold text-white">{player.name}</p>
                <div className="flex items-center flex-wrap gap-x-3 mt-1">
                    <p className="text-xs sm:text-sm text-indigo-400">Score: {formatNumber(player.totalScore || 0)}</p>
                    <p className="text-xs sm:text-sm text-gray-400">{player.gamesPlayed} {player.gamesPlayed <= 1 ? 'partie' : 'parties'}</p>
                </div>
            </div>
        </div>
        {isAdmin && (
            <div className="flex items-center gap-1 sm:gap-2">
                 <button onClick={() => onEdit(player)} className="text-blue-400 hover:text-blue-300 p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"><Pencil size={18} /></button>
                <button onClick={() => onRemove(player)} className="text-red-500 hover:text-red-400 p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"><Trash2 size={18} /></button>
            </div>
        )}
    </div>
);
const LeaderboardItem: FC<{ player: PlayerWithStats; rank: number; onViewProfile: (playerId: string) => void; }> = ({ player, rank, onViewProfile }) => {
    const RankDisplay = () => {
        switch (rank) {
            case 1: return <Trophy className="text-yellow-400" size={24} />;
            case 2: return <Trophy className="text-gray-300" size={24} />;
            case 3: return <Trophy className="text-amber-600" size={24} />;
            default: return <span className="text-xl md:text-2xl font-bold w-8 text-center text-gray-400">{rank}</span>;
        }
    };
    return (
        <div onClick={() => onViewProfile(player.id)} className="bg-gray-800 p-3 sm:p-4 rounded-lg flex items-center justify-between shadow-md cursor-pointer hover:bg-gray-700 transition-colors">
            <div className="flex items-center space-x-3 sm:space-x-4">
                 <div className="w-8 flex justify-center items-center"><RankDisplay /></div>
                <img src={player.imageUrl || `https://placehold.co/50x50/1f2937/ffffff?text=${player.name.charAt(0)}`} alt={player.name} className="w-10 h-10 rounded-full border-2 border-indigo-500 object-cover"/>
                <div>
                  <p className="text-md sm:text-lg font-medium text-white">{player.name}</p>
                   <div className="flex items-center text-xs sm:text-sm text-gray-400 divide-x divide-gray-600">
                     <p className="pr-2">{player.gamesPlayed} {player.gamesPlayed <= 1 ? 'partie' : 'parties'}</p>
                     <p className="pl-2 flex items-center"><Crown size={14} className="mr-1 text-yellow-500"/>{player.wins} {player.wins <= 1 ? 'victoire' : 'victoires'}</p>
                  </div>
                </div>
            </div>
            <div className="text-lg sm:text-xl font-bold text-indigo-400">{formatNumber(player.totalScore || 0)} pts</div>
        </div>
    );
};
const GameHistoryCard: FC<{ game: Game; players: Player[]; onEdit: (game: Game) => void; isAdmin: boolean }> = ({ game, players, onEdit, isAdmin }) => {
    const gameDate = formatDate(game.date);
    const sortedPlayers = [...game.players].sort((a, b) => a.rank - b.rank);
    const getPlayerImage = (playerId: string) => players.find(p => p.id === playerId)?.imageUrl || `https://placehold.co/40x40/1f2937/ffffff?text=P`;
    return (
        <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 border-b border-gray-700 pb-3">
                <h3 className="text-lg sm:text-xl font-bold text-indigo-400 mb-2 sm:mb-0">Partie du {gameDate}</h3>
                <div className="flex items-center justify-between">
                    <span className="text-gray-400 flex items-center text-sm"><Users size={16} className="mr-2"/>{game.players.length} Joueurs</span>
                    {isAdmin && <button onClick={() => onEdit(game)} className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-gray-700 ml-4"><Pencil size={16} /></button>}
                </div>
            </div>
            <ul className="space-y-3">
                {sortedPlayers.map((p) => (
                    <li key={p.playerId} className="flex items-center justify-between bg-gray-700 p-2 sm:p-3 rounded-md text-sm">
                        <div className="flex items-center">
                             <span className="font-bold text-md sm:text-lg w-6 text-yellow-400">{p.rank}</span>
                             <img src={getPlayerImage(p.playerId)} alt={p.name} className="w-8 h-8 rounded-full mx-2 sm:mx-3 object-cover"/>
                            <span className="text-white whitespace-nowrap overflow-hidden text-ellipsis max-w-[100px] sm:max-w-none">{p.name}</span>
                        </div>
                        <div className="flex items-center flex-wrap justify-end">
                            <span className="text-gray-300 mr-2 sm:mr-4 text-xs sm:text-sm">Jetons: {formatNumber(p.chipCount)}</span>
                            <span className="font-semibold text-indigo-400 text-xs sm:text-sm">+{p.score} pts</span>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
const EditPlayerModal: FC<{ show: boolean; onClose: () => void; onUpdate: (playerId: string, data: { name: string; imageUrl: string }) => void; player: Player | null }> = ({ show, onClose, onUpdate, player }) => {
    const [name, setName] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    useEffect(() => { if (player) { setName(player.name); setImageUrl(player.imageUrl || ''); } }, [player]);
    if (!show || !player) return null;
    const handleSave = () => { if (name.trim()) onUpdate(player.id, { name, imageUrl }); };
    return <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4"><div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg border border-gray-700"><h3 className="text-xl font-bold text-white mb-4">Éditer le joueur</h3><div className="space-y-4 my-6"><div><label className="block text-sm font-medium text-gray-400 mb-1">Nom du joueur</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-gray-700 text-white p-3 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"/></div><div><label className="block text-sm font-medium text-gray-400 mb-1">URL de l'image</label><input type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="(Optionnel)" className="w-full bg-gray-700 text-white p-3 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"/></div></div><div className="flex justify-end gap-4"><button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md">Annuler</button><button onClick={handleSave} className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-md">Enregistrer</button></div></div></div>;
}
const SeasonInfoModal: FC<{ show: boolean; onClose: () => void; season: Season | null }> = ({ show, onClose, season }) => {
    if (!show || !season) return null;
    return <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4"><div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg border border-gray-700 text-center"><img src={season.imageUrl || `https://placehold.co/400x200/1f2937/ffffff?text=${season.name}`} alt={`Image pour ${season.name}`} className="w-full h-48 object-cover rounded-md mb-4"/><h3 className="text-2xl font-bold text-white mb-2">{season.name}</h3><p className="text-indigo-400 mb-4">Se termine le {formatDate(season.endDate)}</p>{season.prize && (<div className="bg-gray-700 p-4 rounded-md"><p className="text-lg font-semibold text-yellow-400">Lot à gagner :</p><p className="text-gray-300">{season.prize}</p></div>)}<div className="flex justify-end gap-4 mt-6"><button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md">Fermer</button></div></div></div>
}
const AdminLoginModal: FC<{ show: boolean; onClose: () => void; onLogin: (password: string) => void }> = ({ show, onClose, onLogin }) => {
    const [password, setPassword] = useState('');
    if (!show) return null;
    const handleLogin = () => { onLogin(password); setPassword(''); }
    return <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4"><div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm border border-gray-700"><h3 className="text-xl font-bold text-white mb-4">Accès Administrateur</h3><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleLogin()} placeholder="Mot de passe" className="w-full bg-gray-700 text-white p-3 rounded-md border border-gray-600 mb-4"/><div className="flex justify-end gap-4"><button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md">Fermer</button><button onClick={handleLogin} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-md">Connexion</button></div></div></div>;
};
const EditGameModal: FC<{ show: boolean; game: Game | null; players: Player[]; onClose: () => void; onUpdate: (gameToUpdate: Game, newPlayers: GamePlayer[]) => Promise<void>; showAlert: (message: string, type?: 'info' | 'error' | 'success') => void; }> = ({ show, game, players, onClose, onUpdate, showAlert }) => {
    const [chipCounts, setChipCounts] = useState<{ [key: string]: string }>({});
    const [eliminationOrder, setEliminationOrder] = useState<string[]>([]);
    const gameParticipants = useMemo(() => {
        if (!game) return [];
        return players.filter(p => game.players.some(gp => gp.playerId === p.id));
    }, [game, players]);
    useEffect(() => {
        if (game) {
            const initialChips = game.players.reduce((acc, p) => ({ ...acc, [p.playerId]: p.chipCount > 0 ? String(p.chipCount) : '' }), {});
            const initialElimination = game.players.filter(p => p.chipCount === 0).sort((a, b) => b.rank - a.rank).map(p => p.playerId);
            setChipCounts(initialChips);
            setEliminationOrder(initialElimination);
        }
    }, [game]);
    if (!show || !game) return null;
    const handleEliminatePlayer = (playerId: string) => {
        if (!eliminationOrder.includes(playerId)) setEliminationOrder(prev => [...prev, playerId]);
    };
    const handleChipCountChange = (playerId: string, value: string) => {
        setChipCounts(prev => ({...prev, [playerId]: value}));
        if(value && parseInt(value, 10) >= 0) setEliminationOrder(prev => prev.filter(id => id !== playerId));
    }
    const resetEliminations = () => {
        setEliminationOrder([]);
        setChipCounts({});
    };
    const handleSaveChanges = async () => {
        const totalPlayers = gameParticipants.length;
        const eliminatedPlayers = eliminationOrder.map((playerId, index) => {
            const player = gameParticipants.find(p => p.id === playerId);
            return { playerId, name: player?.name || 'Inconnu', chipCount: 0, rank: totalPlayers - index, score: (totalPlayers - (totalPlayers - index)) * 10 };
        });
        const survivors = gameParticipants.filter(p => !eliminationOrder.includes(p.id)).map(p => ({ playerId: p.id, name: p.name, chipCount: parseInt(chipCounts[p.id] || "0", 10) })).sort((a, b) => b.chipCount - a.chipCount);
        const survivorRankings = survivors.map((survivor, index) => ({ ...survivor, rank: index + 1, score: (totalPlayers - (index + 1)) * 10 }));
        const allRankedPlayers = [...survivorRankings, ...eliminatedPlayers].sort((a,b) => a.rank - b.rank);
        if(allRankedPlayers.length !== totalPlayers){ showAlert("Erreur dans le classement, veuillez vérifier les données.", "error"); return; }
        await onUpdate(game, allRankedPlayers);
        onClose();
    };
    return <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4"><div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg border border-gray-700"><h3 className="text-xl font-bold text-white mb-4">Modifier la partie du {formatDate(game.date)}</h3><div className="space-y-4 my-6 max-h-[60vh] overflow-y-auto pr-2">{gameParticipants.map(player => { const isEliminated = eliminationOrder.includes(player.id); const eliminationRank = isEliminated ? gameParticipants.length - eliminationOrder.indexOf(player.id) : null; return <div key={player.id} className="flex items-center gap-4 p-2 rounded-lg bg-gray-700"><img src={player.imageUrl || `https://placehold.co/40x40/1f2937/ffffff?text=${player.name.charAt(0)}`} alt={player.name} className="w-10 h-10 rounded-full object-cover"/><label className="flex-1 text-white font-medium">{player.name}</label>{isEliminated ? <span className="text-red-400 font-bold">Sorti en {eliminationRank}ème position</span> : <> <input type="number" value={chipCounts[player.id] || ''} onChange={e => handleChipCountChange(player.id, e.target.value)} placeholder="Jetons" className="bg-gray-600 text-white p-2 w-28 rounded-md border border-gray-500"/><button onClick={() => handleEliminatePlayer(player.id)} disabled={!!chipCounts[player.id]} className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-md flex items-center gap-2 disabled:bg-gray-500 disabled:cursor-not-allowed"><LogOut size={16}/>Éliminer</button></>}</div>})}</div><div className="flex justify-between items-center pt-4 border-t border-gray-700"><button onClick={resetEliminations} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md flex items-center gap-2"><RefreshCw size={16}/>Réinitialiser</button><div><button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md mr-2">Annuler</button><button onClick={handleSaveChanges} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md">Enregistrer</button></div></div></div></div>; 
}
const PlayerManagement: FC<{ players: PlayerWithStats[]; isAdmin: boolean; onViewProfile: (playerId: string) => void; }> = ({ players, isAdmin, onViewProfile }) => {
    const [newName, setNewName] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [playerToRemove, setPlayerToRemove] = useState<PlayerWithStats | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [playerToEdit, setPlayerToEdit] = useState<PlayerWithStats | null>(null);
    const addPlayer = async () => {
        if (!newName.trim()) return;
        const playersCollectionRef = collection(db, `artifacts/${appId}/public/data/players`);
        await addDoc(playersCollectionRef, { name: newName, imageUrl: imageUrl, totalScore: 0, totalChipsAmassed: 0, secondPlaceCount: 0, zeroChipCount: 0, firstBloodCount: 0, invincibleStreak: 0, ventreMouCount: 0, seasonWins: 0, consecutiveSeasonWins: 0, consecutiveGamesStreak: 0 });
        setNewName(''); setImageUrl('');
    };
    const handleRemoveClick = (player: PlayerWithStats) => { setPlayerToRemove(player); setShowConfirmModal(true); };
    const confirmRemovePlayer = async () => {
        if (!playerToRemove) return;
        await deleteDoc(doc(db, `artifacts/${appId}/public/data/players`, playerToRemove.id));
        setShowConfirmModal(false); setPlayerToRemove(null);
    };
    const handleEditClick = (player: PlayerWithStats) => {
        setPlayerToEdit(player);
        setShowEditModal(true);
    };
    const handleUpdatePlayer = async (playerId: string, updatedData: { name: string; imageUrl: string }) => {
        const playerRef = doc(db, `artifacts/${appId}/public/data/players`, playerId);
        await updateDoc(playerRef, updatedData);
        setShowEditModal(false);
        setPlayerToEdit(null);
    };
    return <div className="space-y-6"><ConfirmationModal show={showConfirmModal} onClose={() => setShowConfirmModal(false)} onConfirm={confirmRemovePlayer} title="Confirmer la suppression"><p>Êtes-vous sûr de vouloir supprimer le joueur <strong>{playerToRemove?.name}</strong>? Cette action est irréversible.</p></ConfirmationModal><EditPlayerModal show={showEditModal} player={playerToEdit} onClose={() => setShowEditModal(false)} onUpdate={handleUpdatePlayer}/>{isAdmin && (<div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg"><h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Ajouter un Joueur</h2><div className="flex flex-col md:flex-row gap-4"><input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom du joueur" className="flex-grow bg-gray-700 text-white placeholder-gray-400 p-3 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"/><input type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="URL de l'image (optionnel)" className="flex-grow bg-gray-700 text-white placeholder-gray-400 p-3 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"/><button onClick={addPlayer} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 sm:px-6 rounded-md flex items-center justify-center transition-colors"><PlusCircle size={20} className="mr-2"/>Ajouter</button></div></div>)}<div className="space-y-4">{players.map(player => <PlayerCard key={player.id} player={player} onRemove={handleRemoveClick} onEdit={handleEditClick} isAdmin={isAdmin} onViewProfile={onViewProfile} />)}</div></div>;
}
const NewGame: FC<{ players: Player[]; onGameEnd: (scoredPlayers: GamePlayer[]) => Promise<void>; activeSeason: Season | null; showAlert: (message: string, type?: 'info' | 'error' | 'success') => void; }> = ({ players, onGameEnd, activeSeason, showAlert }) => {
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
    const [chipCounts, setChipCounts] = useState<{ [key: string]: string }>({});
    const [eliminationOrder, setEliminationOrder] = useState<string[]>([]);
    const [isGameStarted, setIsGameStarted] = useState(false);
    const gameParticipants = useMemo(() => players.filter(p => selectedPlayers.includes(p.id)), [players, selectedPlayers]);
    const handleEliminatePlayer = (playerId: string) => {
        if (!eliminationOrder.includes(playerId)) setEliminationOrder(prev => [...prev, playerId]);
    };
    const handleChipCountChange = (playerId: string, value: string) => {
        setChipCounts(prev => ({...prev, [playerId]: value}));
        if(value && parseInt(value, 10) >= 0) setEliminationOrder(prev => prev.filter(id => id !== playerId));
    }
    const resetEliminations = () => {
        setEliminationOrder([]);
        setChipCounts({});
    };
    const finishGame = async () => {
        const totalPlayers = gameParticipants.length;
        const eliminatedPlayers = eliminationOrder.map((playerId, index) => {
            const player = gameParticipants.find(p => p.id === playerId);
            return { playerId, name: player?.name || 'Inconnu', chipCount: 0, rank: totalPlayers - index, score: (totalPlayers - (totalPlayers - index)) * 10 };
        });
        const survivors = gameParticipants.filter(p => !eliminationOrder.includes(p.id)).map(p => ({ playerId: p.id, name: p.name, chipCount: parseInt(chipCounts[p.id] || "0", 10) })).sort((a, b) => b.chipCount - a.chipCount);
        const survivorRankings = survivors.map((survivor, index) => ({ ...survivor, rank: index + 1, score: (totalPlayers - (index + 1)) * 10 }));
        const allRankedPlayers = [...survivorRankings, ...eliminatedPlayers].sort((a,b) => a.rank - b.rank);
        if(allRankedPlayers.length !== totalPlayers){ showAlert("Erreur dans le classement, veuillez vérifier les données.", "error"); return; }
        await onGameEnd(allRankedPlayers);
    };
    if (!activeSeason) return <div className="bg-yellow-900 text-yellow-200 p-4 rounded-lg text-center">Aucune saison n'est active. Veuillez en activer une pour lancer une partie.</div>
    return <div className="relative">{!isGameStarted ? <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg space-y-6"><h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Sélectionner les Joueurs</h2><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">{players.map(player => <div key={player.id} onClick={() => setSelectedPlayers(prev => prev.includes(player.id) ? prev.filter(pId => pId !== player.id) : [...prev, player.id])} className={`p-3 rounded-lg cursor-pointer transition-all border-2 ${selectedPlayers.includes(player.id) ? 'bg-indigo-600 border-indigo-400' : 'bg-gray-700 border-gray-600 hover:bg-gray-600'}`}><div className="flex flex-col items-center text-center"><img src={player.imageUrl || `https://placehold.co/80x80/1f2937/ffffff?text=${player.name.charAt(0)}`} alt={player.name} className="w-14 h-14 sm:w-16 sm:h-16 rounded-full mb-2 object-cover"/><p className="text-white font-medium text-sm sm:text-base">{player.name}</p></div></div>)}</div><div className="flex justify-center pt-4"><button onClick={() => setIsGameStarted(true)} disabled={selectedPlayers.length < 2} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 sm:px-8 rounded-md flex items-center justify-center disabled:bg-gray-500 disabled:cursor-not-allowed w-full sm:w-auto"><Gamepad2 size={20} className="mr-2"/>Démarrer la Partie ({selectedPlayers.length})</button></div></div> : <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg space-y-4"><h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Résultats de la partie</h2>{gameParticipants.map(player => { const isEliminated = eliminationOrder.includes(player.id); const eliminationRank = isEliminated ? gameParticipants.length - eliminationOrder.indexOf(player.id) : null; return <div key={player.id} className="flex items-center gap-4 p-2 rounded-lg bg-gray-700"><img src={player.imageUrl || `https://placehold.co/40x40/1f2937/ffffff?text=${player.name.charAt(0)}`} alt={player.name} className="w-10 h-10 rounded-full object-cover"/><label className="flex-1 text-white font-medium">{player.name}</label>{isEliminated ? <span className="text-red-400 font-bold">Sorti en {eliminationRank}ème position</span> : <> <input type="number" value={chipCounts[player.id] || ''} onChange={e => handleChipCountChange(player.id, e.target.value)} placeholder="Jetons" className="bg-gray-600 text-white p-2 w-28 rounded-md border border-gray-500"/><button onClick={() => handleEliminatePlayer(player.id)} disabled={!!chipCounts[player.id]} className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-md flex items-center gap-2 disabled:bg-gray-500 disabled:cursor-not-allowed"><LogOut size={16}/>Éliminer</button></>}</div>})} <div className="flex justify-between items-center pt-4"><button onClick={resetEliminations} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md flex items-center gap-2"><RefreshCw size={16}/>Réinitialiser</button><button onClick={finishGame} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md">Terminer la Partie</button></div></div>}</div>;
}
const Leaderboard: FC<{ players: PlayerWithStats[]; onViewProfile: (playerId: string) => void; }> = ({ players, onViewProfile }) => {
     const sortedPlayers = [...players].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
    return (
        <div className="space-y-4">
            <div className="bg-gray-800 p-4 rounded-lg shadow-lg flex flex-col sm:flex-row items-center justify-between text-yellow-400 gap-2">
                <div className="flex items-center"><Trophy size={24} className="mr-3" /><h2 className="text-xl sm:text-2xl font-bold">Classement de la Saison</h2></div>
            </div>
            {sortedPlayers.map((player, index) => <LeaderboardItem key={player.id} player={player} rank={index + 1} onViewProfile={onViewProfile} />)}
        </div>
    );
}
const GameHistory: FC<{ games: Game[]; players: Player[]; onEditGame: (game: Game) => void; isAdmin: boolean }> = ({ games, players, onEditGame, isAdmin }) => {
    const sortedGames = [...games].sort((a,b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
    return (
         <div className="space-y-6">
             <div className="bg-gray-800 p-4 rounded-lg shadow-lg flex items-center text-indigo-400"><History size={24} className="mr-3" /><h2 className="text-xl sm:text-2xl font-bold">Historique des Parties</h2></div>
            {sortedGames.length > 0 ? (sortedGames.map(game => <GameHistoryCard key={game.id} game={game} players={players} onEdit={onEditGame} isAdmin={isAdmin} />)) : (<p className="text-gray-400 text-center py-8">Aucune partie n'a encore été jouée cette saison.</p>)}
        </div>
    )
}
const SeasonManagement: FC<{ seasons: Season[]; playersWithStats: PlayerWithStats[], onActivateSeason: (seasonToActivate: Season, currentLeaderboard: PlayerWithStats[]) => Promise<void>, onEditSeason: (season: Season) => void; showAlert: (message: string, type?: 'info' | 'error' | 'success') => void; onGeneralReset: () => void; }> = ({ seasons, playersWithStats, onActivateSeason, onEditSeason, showAlert, onGeneralReset }) => {
    const [name, setName] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [endDate, setEndDate] = useState('');
    const [prize, setPrize] = useState('');
    const handleCreateSeason = async () => {
        if (!name.trim() || !endDate) { showAlert("Le nom et la date de fin sont obligatoires.", "error"); return; }
        const seasonsCollectionRef = collection(db, `artifacts/${appId}/public/data/seasons`);
        await addDoc(seasonsCollectionRef, { name, imageUrl, endDate: Timestamp.fromDate(new Date(endDate)), prize, isActive: seasons.length === 0, isClosed: false, });
        setName(''); setImageUrl(''); setEndDate(''); setPrize('');
    };
    return (
        <div className="space-y-8">
            <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg">
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Créer une nouvelle saison</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nom de la saison" className="bg-gray-700 text-white p-3 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"/><input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="URL de l'image (optionnel)" className="bg-gray-700 text-white p-3 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"/><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-gray-700 text-white p-3 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"/><input type="text" value={prize} onChange={e => setPrize(e.target.value)} placeholder="Lot à gagner (optionnel)" className="bg-gray-700 text-white p-3 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"/><button onClick={handleCreateSeason} className="md:col-span-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-md flex items-center justify-center transition-colors"><PlusCircle size={20} className="mr-2"/>Créer la Saison</button></div>
            </div>
            <div className="space-y-4">
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Liste des Saisons</h2>
                {seasons.sort((a,b) => (b.endDate.seconds || 0) - (a.endDate.seconds || 0)).map(season => (
                    <div key={season.id} className="bg-gray-800 p-4 rounded-lg flex flex-col sm:flex-row items-center justify-between">
                       <div className="flex items-center"><img src={season.imageUrl || `https://placehold.co/80x45/1f2937/ffffff?text=S`} alt={season.name} className="w-20 h-12 object-cover rounded mr-4"/><div><p className="text-white font-bold">{season.name}</p><p className="text-sm text-gray-400">Termine le: {formatDate(season.endDate)}</p></div></div>
                       <div className="mt-4 sm:mt-0 flex items-center gap-2">{season.isActive && <span className="flex items-center gap-2 text-green-400 font-bold bg-green-900/50 px-3 py-1 rounded-full"><PlayCircle size={16}/>Active</span>}{season.isActive && <button onClick={() => onEditSeason(season)} className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-full"><Pencil size={16}/></button>}{season.isClosed && <span className="flex items-center gap-2 text-red-400 font-bold bg-red-900/50 px-3 py-1 rounded-full"><Archive size={16}/>Fermée</span>}{!season.isActive && !season.isClosed && <button onClick={() => onActivateSeason(season, playersWithStats)} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-md">Activer</button>}</div>
                    </div>
                ))}
            </div>
            <div className="bg-red-900/50 border-2 border-red-500 p-4 sm:p-6 rounded-lg shadow-lg mt-12"><h2 className="text-xl sm:text-2xl font-bold text-red-300 mb-4 flex items-center"><AlertTriangle className="mr-3" />Zone de Danger</h2><p className="text-red-300 mb-4">L'action ci-dessous est irréversible et entraînera une perte complète de toutes les données de jeu.</p><button onClick={onGeneralReset} className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-md flex items-center justify-center transition-colors w-full sm:w-auto"><Trash2 size={20} className="mr-2"/>Réinitialisation Générale (RAZ)</button></div>
        </div>
    );
};
const EditSeasonModal: FC<{ show: boolean; onClose: () => void; season: Season | null; onUpdate: (seasonId: string, data: { name: string; imageUrl: string; endDate: string; prize: string }) => void; }> = ({ show, onClose, season, onUpdate }) => {
    const [name, setName] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [endDate, setEndDate] = useState('');
    const [prize, setPrize] = useState('');
    useEffect(() => {
        if(season) {
            setName(season.name);
            setImageUrl(season.imageUrl || '');
            setEndDate(formatDate(season.endDate, 'short'));
            setPrize(season.prize);
        }
    }, [season]);
    if (!show || !season) return null;
    const handleSave = () => {
        if (!name.trim() || !endDate) return;
        onUpdate(season.id, { name, imageUrl, endDate, prize });
    };
    return <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4"><div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg border border-gray-700"><h3 className="text-xl font-bold text-white mb-4">Éditer la saison</h3><div className="space-y-4 my-6"><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nom de la saison" className="w-full bg-gray-700 text-white p-3 rounded-md border border-gray-600"/><input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="URL de l'image (optionnel)" className="w-full bg-gray-700 text-white p-3 rounded-md border border-gray-600"/><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-gray-700 text-white p-3 rounded-md border border-gray-600"/><input type="text" value={prize} onChange={e => setPrize(e.target.value)} placeholder="Lot à gagner (optionnel)" className="w-full bg-gray-700 text-white p-3 rounded-md border border-gray-600"/></div><div className="flex justify-end gap-4"><button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md">Annuler</button><button onClick={handleSave} className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-md">Enregistrer</button></div></div></div>;
};
const PastSeasons: FC<{seasons: Season[], isAdmin: boolean, onDeleteSeason: (seasonId: string) => void}> = ({ seasons, isAdmin, onDeleteSeason }) => {
    const closedSeasons = useMemo(() => seasons.filter(s => s.isClosed).sort((a, b) => b.endDate.seconds - a.endDate.seconds), [seasons]);
    if(closedSeasons.length === 0) return <p className="text-gray-400 text-center py-8">Il n'y a pas encore de saison archivée.</p>
    return (
        <div className="space-y-8">
             <div className="bg-gray-800 p-4 rounded-lg shadow-lg flex items-center text-indigo-400"><ArchiveRestore size={24} className="mr-3" /><h2 className="text-xl sm:text-2xl font-bold">Archives des Saisons</h2></div>
            {closedSeasons.map(season => {
                const winner = season.finalLeaderboard?.find(p => p.rank === 1);
                return (
                    <div key={season.id} className="bg-gray-800 p-6 rounded-lg shadow-lg">
                        <div className="flex justify-between items-start mb-4">
                            <div><h3 className="text-2xl font-bold text-yellow-400">{season.name}</h3><p className="text-gray-400">Saison terminée le {formatDate(season.endDate)}</p></div>
                            {isAdmin && <button onClick={() => onDeleteSeason(season.id)} className="bg-red-800 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-md"><Trash2 size={16}/></button>}
                        </div>
                        {winner && season.prize && (<div className="bg-yellow-900/50 text-yellow-300 p-3 rounded-lg text-center mb-4"><p>🏆 <strong className="font-bold">{winner.name}</strong> a gagné : {season.prize}</p></div>)}
                        <ul className="space-y-2">{season.finalLeaderboard?.sort((a,b) => (a.rank || 0) - (b.rank || 0)).map(player => <li key={player.id} className="flex items-center justify-between bg-gray-700 p-3 rounded-md"><div className="flex items-center"><span className="font-bold text-lg w-8">{player.rank}</span><img src={player.imageUrl || `https://placehold.co/40x40/1f2937/ffffff?text=${player.name.charAt(0)}`} alt={player.name} className="w-10 h-10 rounded-full mx-3 object-cover"/><span className="text-white">{player.name}</span></div><div className="font-semibold text-indigo-400">{formatNumber(player.totalScore)} pts</div></li>)}</ul>
                    </div>
                );
            })}
        </div>
    )
}
const PlayerProfile: FC<{ player: Player, allGames: Game[], playerAchievements: PlayerAchievement[] }> = ({ player, allGames, playerAchievements }) => {
    const globalStats = useMemo(() => {
        const totalGamesPlayed = allGames.filter(g => g.players.some(p => p.playerId === player.id)).length;
        const totalWins = allGames.filter(g => g.players.some(p => p.playerId === player.id && p.rank === 1)).length;
        let totalRanks = 0;
        let lastPlaceCount = 0;
        allGames.forEach(g => {
            const playerInGame = g.players.find(p => p.playerId === player.id);
            if(playerInGame) {
                totalRanks += playerInGame.rank;
                if(playerInGame.rank === g.players.length) lastPlaceCount++;
            }
        });
        const averageRank = totalGamesPlayed > 0 ? (totalRanks / totalGamesPlayed).toFixed(2) : 'N/A';
        return { totalGamesPlayed, totalWins, averageRank, lastPlaceCount };
    }, [player, allGames]);
    const unlockedAchievements = useMemo(() => {
        return achievementsList.filter(ach => playerAchievements.some(pa => pa.playerId === player.id && pa.achievementId === ach.id));
    }, [player, playerAchievements]);
    const StatCard: FC<{icon: React.ElementType, emoji: string, value: string | number, label: string, colorClass: string}> = ({ icon, emoji, value, label, colorClass }) => {
        const Icon = icon;
        return <div className="bg-gray-700 p-4 rounded-lg flex items-center gap-4"><div className={`p-3 rounded-lg ${colorClass}`}><Icon size={28} className="text-white" /></div><div><p className="text-2xl font-bold text-white">{value} <span className="text-xl">{emoji}</span></p><p className="text-sm text-gray-400">{label}</p></div></div>;
    }
    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <div className="flex flex-col sm:flex-row items-center gap-6 mb-8"><img src={player.imageUrl || `https://placehold.co/150x150/1f2937/ffffff?text=${player.name.charAt(0)}`} alt={player.name} className="w-36 h-36 rounded-full border-4 border-indigo-500 object-cover"/><div className="text-center sm:text-left"><h2 className="text-3xl font-bold text-white">{player.name}</h2><p className="text-indigo-400">Statistiques globales</p></div></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatCard icon={Gamepad2} emoji="🎮" value={globalStats.totalGamesPlayed} label="Parties Jouées" colorClass="bg-blue-500" />
                <StatCard icon={Trophy} emoji="🏆" value={globalStats.totalWins} label="Victoires" colorClass="bg-yellow-500" />
                <StatCard icon={BarChart2} emoji="📊" value={globalStats.averageRank} label="Classement Moyen" colorClass="bg-green-500" />
                <StatCard icon={Bomb} emoji="😥" value={globalStats.lastPlaceCount} label="Dernières Places" colorClass="bg-red-500" />
                <StatCard icon={PiggyBank} emoji="💰" value={formatNumber(player.totalChipsAmassed)} label="Jetons Amassés (Total)" colorClass="bg-pink-500" />
            </div>
            <div className="mt-8"><h3 className="text-xl font-bold text-white mb-4">Hauts Faits Débloqués</h3>{unlockedAchievements.length > 0 ? <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{unlockedAchievements.map(ach => <div key={ach.id} className="bg-gray-700 p-4 rounded-lg flex items-center gap-4"><span className="text-4xl">{ach.emoji}</span><div><p className="font-bold text-white">{ach.name}</p><p className="text-sm text-gray-400">{ach.description}</p></div></div>)}</div> : <p className="text-gray-400">Aucun haut fait débloqué pour le moment.</p>}</div>
        </div>
    );
}
const NewsFeed: FC<{ news: NewsItem[] }> = ({ news }) => {
    return (
        <div className="space-y-4">
            <div className="bg-gray-800 p-4 rounded-lg shadow-lg flex items-center text-indigo-400"><Newspaper size={24} className="mr-3" /><h2 className="text-xl sm:text-2xl font-bold">Fil d'actualités</h2></div>
            {news.length > 0 ? news.map(item => <div key={item.id} className="bg-gray-800 p-4 rounded-lg shadow-md"><p className="text-white">{item.text}</p><p className="text-xs text-gray-500 mt-2 text-right">{formatDate(item.createdAt)}</p></div>) : <p className="text-gray-400 text-center py-8">Aucune actualité pour le moment.</p>}
        </div>
    );
}
const AchievementsList: FC = () => {
    return (
        <div className="space-y-4">
            <div className="bg-gray-800 p-4 rounded-lg shadow-lg flex items-center text-indigo-400"><Medal size={24} className="mr-3" /><h2 className="text-xl sm:text-2xl font-bold">Liste des Hauts Faits</h2></div>
            {achievementsList.map(ach => <div key={ach.id} className="bg-gray-800 p-4 rounded-lg flex items-start gap-4"><span className="text-5xl mt-1">{ach.emoji}</span><div><p className="font-bold text-white text-lg">{ach.name} ({ach.type})</p><p className="text-sm text-gray-400">{ach.description}</p></div></div>)}
        </div>
    );
}

// --- Main App Component ---
export default function App() {
    const [view, setView] = useState('news');
    const [players, setPlayers] = useState<Player[]>([]);
    const [games, setGames] = useState<Game[]>([]);
    const [seasons, setSeasons] = useState<Season[]>([]);
    const [newsFeed, setNewsFeed] = useState<NewsItem[]>([]);
    const [playerAchievements, setPlayerAchievements] = useState<PlayerAchievement[]>([]);
    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [editingGame, setEditingGame] = useState<Game | null>(null);
    const [editingSeason, setEditingSeason] = useState<Season | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [showAdminLogin, setShowAdminLogin] = useState(false);
    const [showSeasonInfo, setShowSeasonInfo] = useState(false);
    const [seasonToDelete, setSeasonToDelete] = useState<Season | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [alert, setAlert] = useState({ show: false, message: '', type: 'info' as 'info' | 'error' | 'success' });

    useEffect(() => { if (alert.show) { const timer = setTimeout(() => setAlert({ show: false, message: '', type: 'info' }), 3000); return () => clearTimeout(timer); } }, [alert]);
    const showAlert = (message: string, type: 'info' | 'error' | 'success' = 'info') => setAlert({ show: true, message, type });

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                try {
                    await signInAnonymously(auth);
                } catch (error) {
                    console.error("Anonymous auth error:", error);
                    showAlert("Erreur d'authentification", "error");
                }
            }
            setIsAuthReady(true);
        });
        return () => unsubscribeAuth();
    }, []);
    
    useEffect(() => {
        if (!isAuthReady) return;
        setLoading(true);
        const playersPath = `artifacts/${appId}/public/data/players`;
        const gamesPath = `artifacts/${appId}/public/data/games`;
        const seasonsPath = `artifacts/${appId}/public/data/seasons`;
        const newsPath = `artifacts/${appId}/public/data/news_feed`;
        const achievementsPath = `artifacts/${appId}/public/data/player_achievements`;

        const unsubPlayers = onSnapshot(query(collection(db, playersPath)), (snap) => { setPlayers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player))); setLoading(false); }, (err) => { console.error("Player read error: ", err); setLoading(false); });
        const unsubGames = onSnapshot(query(collection(db, gamesPath)), (snap) => { setGames(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Game))); }, (err) => { console.error("Games read error: ", err);});
        const unsubSeasons = onSnapshot(query(collection(db, seasonsPath)), (snap) => { setSeasons(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Season))); }, (err) => { console.error("Seasons read error: ", err);});
        const unsubNews = onSnapshot(query(collection(db, newsPath), orderBy('createdAt', 'desc'), limit(20)), (snap) => { setNewsFeed(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as NewsItem))); }, (err) => { console.error("News read error: ", err);});
        const unsubPlayerAchievements = onSnapshot(query(collection(db, achievementsPath)), (snap) => { setPlayerAchievements(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlayerAchievement))); }, (err) => { console.error("Player Achievements read error: ", err);});
        
        return () => { unsubPlayers(); unsubGames(); unsubSeasons(); unsubNews(); unsubPlayerAchievements(); };
    }, [isAuthReady]);

    const activeSeason = useMemo(() => seasons.find(s => s.isActive) || null, [seasons]);
    const gamesOfActiveSeason = useMemo(() => {
        if (!activeSeason) return [];
        return games.filter(g => g.seasonId === activeSeason.id);
    }, [games, activeSeason]);

    const playersWithStats = useMemo((): PlayerWithStats[] => {
        const stats: {[key: string]: { gamesPlayed: number, wins: number }} = {};
        players.forEach(p => { stats[p.id] = { gamesPlayed: 0, wins: 0 }; });
    
        gamesOfActiveSeason.forEach(game => {
            if (!game.players) return;
            const winner = game.players.find(p => p.rank === 1);
            if(winner && stats[winner.playerId]) {
                stats[winner.playerId].wins = (stats[winner.playerId].wins || 0) + 1;
            }
            game.players.forEach(p => {
                if (stats[p.playerId]) {
                   stats[p.playerId].gamesPlayed = (stats[p.playerId].gamesPlayed || 0) + 1;
                }
            });
        });
        return players.map(player => ({...player, ...stats[player.id]})).sort((a,b) => (b.totalScore || 0) - (a.totalScore || 0));
    }, [players, gamesOfActiveSeason]);

    const selectedPlayer = useMemo(() => {
        if (!selectedPlayerId) return null;
        return players.find(p => p.id === selectedPlayerId) || null;
    }, [selectedPlayerId, players]);

    const handleAdminLogin = (password: string) => {
        if (password === ADMIN_PASSWORD) { setIsAdmin(true); setShowAdminLogin(false); showAlert("Mode administrateur activé", "success"); } 
        else { showAlert("Mot de passe incorrect", "error"); }
    };
    const handleAdminLogout = () => { setIsAdmin(false); showAlert("Mode administrateur désactivé"); };
    
    const checkAchievements = async (newGame: Game, updatedPlayers: Player[], allGames: Game[], currentActiveSeason: Season | null, batch: any) => {
        if (!currentActiveSeason) return;
        const newsCollection = collection(db, `artifacts/${appId}/public/data/news_feed`);
        const playerAchievementsCollection = collection(db, `artifacts/${appId}/public/data/player_achievements`);

        for (const p of newGame.players) {
            const player = updatedPlayers.find(up => up.id === p.playerId);
            if (!player) continue;
            const hasAchievement = (id: string) => playerAchievements.some(pa => pa.playerId === player.id && pa.achievementId === id);

            if (!hasAchievement('serial_killer') && newGame.players.length >= 5 && p.rank === 1 && newGame.players.filter(gp => gp.chipCount > 0).length === 1) {
                batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'serial_killer', unlockedAt: Timestamp.now() });
                batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'serial_killer')!.newsPhrase(player.name), createdAt: Timestamp.now() });
            }
            if (!hasAchievement('magnate') && p.chipCount > 130000) {
                 batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'magnate', unlockedAt: Timestamp.now() });
                 batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'magnate')!.newsPhrase(player.name, {chipCount: p.chipCount}), createdAt: Timestamp.now() });
            } else if (!hasAchievement('evening_millionaire') && p.chipCount > 80000) {
                batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'evening_millionaire', unlockedAt: Timestamp.now() });
                batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'evening_millionaire')!.newsPhrase(player.name, {chipCount: p.chipCount}), createdAt: Timestamp.now() });
            }
            if (!hasAchievement('survivor') && newGame.players.length >= 6 && p.chipCount > 0 && p.chipCount <= 3000 && p.rank === newGame.players.filter(gp => gp.chipCount > 0).length) {
                batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'survivor', unlockedAt: Timestamp.now() });
                batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'survivor')!.newsPhrase(player.name), createdAt: Timestamp.now() });
            }
            if (!hasAchievement('precise') && p.chipCount > 0 && p.chipCount % 10000 === 0) {
                batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'precise', unlockedAt: Timestamp.now() });
                batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'precise')!.newsPhrase(player.name), createdAt: Timestamp.now() });
            }
            const chipString = p.chipCount.toString();
            const hasTriple = /(\d)\1\1/.test(chipString);
            if (!hasAchievement('collector') && p.chipCount > 0 && hasTriple) {
                batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'collector', unlockedAt: Timestamp.now() });
                batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'collector')!.newsPhrase(player.name), createdAt: Timestamp.now() });
            }

            const allPlayerGames = [...allGames, newGame].filter(g => g.players.some(gp => gp.playerId === player.id));
            if (!hasAchievement('veteran') && allPlayerGames.length >= 10) { batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'veteran', unlockedAt: Timestamp.now() }); batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'veteran')!.newsPhrase(player.name), createdAt: Timestamp.now() }); }
            if (!hasAchievement('pillar') && allPlayerGames.length >= 25) { batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'pillar', unlockedAt: Timestamp.now() }); batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'pillar')!.newsPhrase(player.name), createdAt: Timestamp.now() }); }
            if (!hasAchievement('legend') && allPlayerGames.length >= 50) { batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'legend', unlockedAt: Timestamp.now() }); batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'legend')!.newsPhrase(player.name), createdAt: Timestamp.now() }); }
            if (!hasAchievement('poulidor') && (player.secondPlaceCount || 0) >= 10) { batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'poulidor', unlockedAt: Timestamp.now() }); batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'poulidor')!.newsPhrase(player.name), createdAt: Timestamp.now() }); }
            if (!hasAchievement('holed_pocket') && (player.zeroChipCount || 0) >= 10) { batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'holed_pocket', unlockedAt: Timestamp.now() }); batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'holed_pocket')!.newsPhrase(player.name), createdAt: Timestamp.now() }); }
            if (!hasAchievement('first_blood') && (player.firstBloodCount || 0) >= 5) { batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'first_blood', unlockedAt: Timestamp.now() }); batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'first_blood')!.newsPhrase(player.name), createdAt: Timestamp.now() }); }
            if (!hasAchievement('invincible') && (player.invincibleStreak || 0) >= 8) { batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'invincible', unlockedAt: Timestamp.now() }); batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'invincible')!.newsPhrase(player.name), createdAt: Timestamp.now() }); }
            if (!hasAchievement('soft_belly') && (player.ventreMouCount || 0) >= 5) { batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'soft_belly', unlockedAt: Timestamp.now() }); batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'soft_belly')!.newsPhrase(player.name), createdAt: Timestamp.now() }); }
            if (!hasAchievement('the_bubble') && (player.secondPlaceCount || 0) >= 8) { batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'the_bubble', unlockedAt: Timestamp.now() }); batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'the_bubble')!.newsPhrase(player.name), createdAt: Timestamp.now() }); }
            if (!hasAchievement('millionaire') && (player.totalChipsAmassed || 0) >= 1000000) { batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'millionaire', unlockedAt: Timestamp.now() }); batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'millionaire')!.newsPhrase(player.name), createdAt: Timestamp.now() }); }
            else if (!hasAchievement('golden_boy') && (player.totalChipsAmassed || 0) >= 500000) { batch.set(doc(playerAchievementsCollection), { playerId: player.id, achievementId: 'golden_boy', unlockedAt: Timestamp.now() }); batch.set(doc(newsCollection), { text: achievementsList.find(a => a.id === 'golden_boy')!.newsPhrase(player.name), createdAt: Timestamp.now() }); }
        }

        const seasonGames = [...allGames, newGame].filter(g => g.seasonId === currentActiveSeason.id);
        const seasonalAchievements = achievementsList.filter(a => a.type === 'saisonnier');
        for (const achievement of seasonalAchievements) {
            const playerStats: { [playerId: string]: number } = {};
            updatedPlayers.forEach(p => playerStats[p.id] = 0);

            if (achievement.id === 'assidu') seasonGames.forEach(g => { g.players.forEach(p => playerStats[p.playerId]++); });
            else if (achievement.id === 'metronome') updatedPlayers.forEach(p => { playerStats[p.id] = p.consecutiveGamesStreak || 0; });
            else if (achievement.id === 'conqueror') seasonGames.forEach(g => { const winner = g.players.find(p => p.rank === 1); if (winner) playerStats[winner.playerId]++; });
            else if (achievement.id === 'red_lantern') seasonGames.forEach(g => { const loser = g.players.find(p => p.rank === g.players.length); if (loser) playerStats[loser.playerId]++; });
            else if (achievement.id === 'eternal_second') seasonGames.forEach(g => { const second = g.players.find(p => p.rank === 2); if (second) playerStats[second.playerId]++; });
            else if (achievement.id === 'kamikaze') seasonGames.forEach(g => { g.players.forEach(p => { if(p.chipCount === 0) playerStats[p.playerId]++; }); });
            
            const maxStat = Math.max(...Object.values(playerStats));
            if (maxStat === 0) continue;

            const newLeaders = Object.keys(playerStats).filter(id => playerStats[id] === maxStat);
            const oldLeaders = playerAchievements.filter(pa => pa.achievementId === achievement.id).map(pa => pa.playerId);
            const leadersChanged = newLeaders.length !== oldLeaders.length || !newLeaders.every(id => oldLeaders.includes(id));

            if (leadersChanged) {
                oldLeaders.forEach(oldLeaderId => {
                    if (!newLeaders.includes(oldLeaderId)) {
                        const achievementDoc = playerAchievements.find(pa => pa.playerId === oldLeaderId && pa.achievementId === achievement.id);
                        if (achievementDoc) {
                            batch.delete(doc(db, `artifacts/${appId}/public/data/player_achievements`, achievementDoc.id));
                            if (achievement.lossPhrase && newLeaders.length > 0) {
                                const oldLeaderName = updatedPlayers.find(p => p.id === oldLeaderId)?.name || 'Un ancien';
                                const newLeaderName = updatedPlayers.find(p => p.id === newLeaders[0])?.name || 'Un nouveau';
                                batch.set(doc(newsCollection), { text: achievement.lossPhrase(oldLeaderName, newLeaderName), createdAt: Timestamp.now() });
                            }
                        }
                    }
                });
                newLeaders.forEach(newLeaderId => {
                    if (!oldLeaders.includes(newLeaderId)) {
                        const leaderName = updatedPlayers.find(p => p.id === newLeaderId)?.name || 'Un joueur';
                        batch.set(doc(playerAchievementsCollection), { playerId: newLeaderId, achievementId: achievement.id, unlockedAt: Timestamp.now() });
                        batch.set(doc(newsCollection), { text: achievement.newsPhrase(leaderName), createdAt: Timestamp.now() });
                    }
                });
            }
        }
    };

    const handleGameEnd = async (scoredPlayers: GamePlayer[]) => {
        if (!activeSeason) { showAlert("Aucune saison active pour enregistrer la partie.", "error"); return; }
        const batch = writeBatch(db);
        const newGameRef = doc(collection(db, `artifacts/${appId}/public/data/games`));
        const newGameData = { date: new Date(), players: scoredPlayers, seasonId: activeSeason.id };
        batch.set(newGameRef, newGameData);
        const updatedPlayersData: Player[] = JSON.parse(JSON.stringify(players));

        for (const player of updatedPlayersData) {
            const gamePlayer = scoredPlayers.find(sp => sp.playerId === player.id);
            const playerRef = doc(db, `artifacts/${appId}/public/data/players`, player.id);
            
            player.totalChipsAmassed = player.totalChipsAmassed || 0;
            player.secondPlaceCount = player.secondPlaceCount || 0;
            player.zeroChipCount = player.zeroChipCount || 0;
            player.firstBloodCount = player.firstBloodCount || 0;
            player.invincibleStreak = player.invincibleStreak || 0;
            player.ventreMouCount = player.ventreMouCount || 0;
            player.consecutiveGamesStreak = player.consecutiveGamesStreak || 0;

            if (gamePlayer) {
                player.totalScore = (player.totalScore || 0) + gamePlayer.score;
                player.totalChipsAmassed += gamePlayer.chipCount;
                if (gamePlayer.rank === 2) player.secondPlaceCount++;
                if (gamePlayer.chipCount === 0) player.zeroChipCount++;
                if (gamePlayer.rank === scoredPlayers.length) {
                    player.firstBloodCount++;
                    player.invincibleStreak = 0; 
                } else {
                    player.invincibleStreak++;
                }
                if (scoredPlayers.length % 2 !== 0 && gamePlayer.rank === Math.ceil(scoredPlayers.length / 2)) {
                    player.ventreMouCount++;
                }
                player.consecutiveGamesStreak++;
            } else {
                player.consecutiveGamesStreak = 0;
            }
            
            batch.update(playerRef, {
                totalScore: player.totalScore,
                totalChipsAmassed: player.totalChipsAmassed,
                secondPlaceCount: player.secondPlaceCount,
                zeroChipCount: player.zeroChipCount,
                firstBloodCount: player.firstBloodCount,
                invincibleStreak: player.invincibleStreak,
                ventreMouCount: player.ventreMouCount,
                consecutiveGamesStreak: player.consecutiveGamesStreak
            });
        }
        await checkAchievements({id: newGameRef.id, ...newGameData, date: Timestamp.fromDate(newGameData.date)}, updatedPlayersData, games, activeSeason, batch);
        await batch.commit();
        showAlert("La partie a été enregistrée !", "success");
        setView('news');
    };

    const handleGameUpdate = async (gameToUpdate: Game, newPlayers: GamePlayer[]) => {
        showAlert("La modification de partie ne met pas à jour les hauts faits pour le moment.", "info");
        const batch = writeBatch(db);
        const gameRef = doc(db, `artifacts/${appId}/public/data/games`, gameToUpdate.id);
        const scoreDiffs: {[key: string]: number} = {};
        gameToUpdate.players.forEach(oldPlayer => {
            scoreDiffs[oldPlayer.playerId] = (scoreDiffs[oldPlayer.playerId] || 0) - oldPlayer.score;
        });
        newPlayers.forEach(newPlayer => {
            scoreDiffs[newPlayer.playerId] = (scoreDiffs[newPlayer.playerId] || 0) + newPlayer.score;
        });
        for (const playerId in scoreDiffs) {
            const playerRef = doc(db, `artifacts/${appId}/public/data/players`, playerId);
            const player = players.find(p => p.id === playerId);
            if(player) {
                const newTotalScore = (player.totalScore || 0) + scoreDiffs[playerId];
                batch.update(playerRef, { totalScore: newTotalScore });
            }
        }
        batch.update(gameRef, { players: newPlayers });
        await batch.commit();
        showAlert("La partie a été mise à jour avec succès !", "success");
        setEditingGame(null);
    };
    
    const handleActivateSeason = async (seasonToActivate: Season, currentLeaderboard: PlayerWithStats[]) => {
        const batch = writeBatch(db);
        if(activeSeason) {
            const winner = currentLeaderboard.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))[0];
            if (winner) {
                const winnerRef = doc(db, `artifacts/${appId}/public/data/players`, winner.id);
                const winnerData = players.find(p => p.id === winner.id);
                if(winnerData) {
                    const newSeasonWins = (winnerData.seasonWins || 0) + 1;
                    let newConsecutiveWins = winnerData.consecutiveSeasonWins || 0;
                    const allClosedSeasons = seasons.filter(s => s.isClosed).sort((a,b) => b.endDate.seconds - a.endDate.seconds);
                    const lastClosedSeason = allClosedSeasons[0];

                    if(lastClosedSeason && lastClosedSeason.finalLeaderboard && lastClosedSeason.finalLeaderboard[0]?.id === winner.id) {
                        newConsecutiveWins++;
                    } else {
                        newConsecutiveWins = 1;
                    }
                    
                    batch.update(winnerRef, { seasonWins: newSeasonWins, consecutiveSeasonWins: newConsecutiveWins });

                    const hasAchievement = (id: string) => playerAchievements.some(pa => pa.playerId === winner.id && pa.achievementId === id);

                    if (!hasAchievement('champion')) {
                        batch.set(doc(collection(db, `artifacts/${appId}/public/data/player_achievements`)), { playerId: winner.id, achievementId: 'champion', unlockedAt: Timestamp.now() });
                        batch.set(doc(collection(db, `artifacts/${appId}/public/data/news_feed`)), { text: achievementsList.find(a => a.id === 'champion')!.newsPhrase(winner.name, {seasonName: activeSeason.name}), createdAt: Timestamp.now() });
                    }

                    const dynastyAchievements = {'poker_god': 5, 'emperor': 4, 'dynasty': 3, 'double_champion': 2, 'back_to_back': 2 };

                    for (const [id, count] of Object.entries(dynastyAchievements)) {
                        if(!hasAchievement(id)) {
                            const isConsecutiveCheck = id === 'back_to_back';
                            const winCount = isConsecutiveCheck ? newConsecutiveWins : newSeasonWins;
                            if(winCount >= count) {
                                batch.set(doc(collection(db, `artifacts/${appId}/public/data/player_achievements`)), { playerId: winner.id, achievementId: id, unlockedAt: Timestamp.now() });
                                batch.set(doc(collection(db, `artifacts/${appId}/public/data/news_feed`)), { text: achievementsList.find(a => a.id === id)!.newsPhrase(winner.name, {seasonName: activeSeason.name}), createdAt: Timestamp.now() });
                            }
                        }
                    }
                }
            }
            const oldSeasonRef = doc(db, `artifacts/${appId}/public/data/seasons`, activeSeason.id);
            batch.update(oldSeasonRef, { isActive: false, isClosed: true, finalLeaderboard: currentLeaderboard.map((p, index) => ({...p, rank: index + 1})) });
        }

        const newSeasonRef = doc(db, `artifacts/${appId}/public/data/seasons`, seasonToActivate.id);
        batch.update(newSeasonRef, { isActive: true });
        players.forEach(player => {
            const playerRef = doc(db, `artifacts/${appId}/public/data/players`, player.id);
            batch.update(playerRef, { totalScore: 0, consecutiveGamesStreak: 0 });
            if(player.id !== activeSeason?.finalLeaderboard?.[0]?.id) {
                batch.update(playerRef, { consecutiveSeasonWins: 0 });
            }
        });

        await batch.commit();
        showAlert(`La saison "${seasonToActivate.name}" est maintenant active !`, "success");
        setView('news');
    }
    const handleUpdateSeason = async (seasonId: string, updatedData: { name: string; imageUrl: string; endDate: string; prize: string }) => {
        const seasonRef = doc(db, `artifacts/${appId}/public/data/seasons`, seasonId);
        await updateDoc(seasonRef, {
            name: updatedData.name,
            imageUrl: updatedData.imageUrl,
            endDate: Timestamp.fromDate(new Date(updatedData.endDate)),
            prize: updatedData.prize,
        });
        showAlert("Saison mise à jour avec succès !", "success");
        setEditingSeason(null);
    };
    const handleDeleteSeason = (seasonId: string) => {
        const season = seasons.find(s => s.id === seasonId);
        if(!season) return;
        setSeasonToDelete(season);
    }
    const confirmDeleteSeason = async () => {
        if(!seasonToDelete) return;
        await deleteDoc(doc(db, `artifacts/${appId}/public/data/seasons`, seasonToDelete.id));
        setSeasonToDelete(null);
        showAlert("Saison supprimée avec succès.", "success");
    }
    const handleGeneralReset = async () => {
        setShowResetConfirm(false);
        showAlert("Réinitialisation en cours...", "info");
        try {
            const batch = writeBatch(db);
            const collectionsToWipe = ['games', 'seasons', 'news_feed', 'player_achievements'];
            for (const collectionName of collectionsToWipe) {
                const collectionRef = collection(db, `artifacts/${appId}/public/data/${collectionName}`);
                const snapshot = await getDocs(query(collectionRef));
                snapshot.forEach(doc => batch.delete(doc.ref));
            }
            for (const player of players) {
                const playerRef = doc(db, `artifacts/${appId}/public/data/players`, player.id);
                batch.update(playerRef, { totalScore: 0, totalChipsAmassed: 0, secondPlaceCount: 0, zeroChipCount: 0, firstBloodCount: 0, invincibleStreak: 0, ventreMouCount: 0, seasonWins: 0, consecutiveSeasonWins: 0, consecutiveGamesStreak: 0 });
            }
            await batch.commit();
            showAlert("Réinitialisation générale terminée avec succès !", "success");
            setView('news');
        } catch (error) {
            console.error("Error during general reset:", error);
            showAlert("Une erreur est survenue lors de la réinitialisation.", "error");
        }
    }
    const handleViewProfile = (playerId: string) => {
        setSelectedPlayerId(playerId);
        setView('player_profile');
    }
    const NavButton: FC<{ targetView: string; icon: React.ElementType; label: string }> = ({ targetView, icon, label }) => {
        const Icon = icon;
        return <button onClick={() => setView(targetView)} className={`flex-1 flex flex-col sm:flex-row items-center justify-center p-3 rounded-md text-sm sm:text-base font-medium transition-colors ${view === targetView ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}><Icon size={20} className="mb-1 sm:mb-0 sm:mr-2" />{label}</button>
    }

    const renderView = () => {
        if (loading || !isAuthReady) return <div className="text-center text-white py-10">Chargement des données...</div>
        switch (view) {
            case 'news': return <NewsFeed news={newsFeed} />;
            case 'home': return <Leaderboard players={playersWithStats} onViewProfile={handleViewProfile}/>;
            case 'players': return <PlayerManagement players={playersWithStats} isAdmin={isAdmin} onViewProfile={handleViewProfile}/>;
            case 'new_game': return isAdmin ? <NewGame players={players} onGameEnd={handleGameEnd} activeSeason={activeSeason} showAlert={showAlert}/> : <div className='text-center text-gray-400 p-8 bg-gray-800 rounded-lg'>Vous devez être administrateur pour créer une partie.</div>;
            case 'history': return <GameHistory games={gamesOfActiveSeason} players={players} onEditGame={(game: Game) => setEditingGame(game)} isAdmin={isAdmin} />;
            case 'seasons': return <SeasonManagement seasons={seasons} playersWithStats={playersWithStats} onActivateSeason={handleActivateSeason} onEditSeason={setEditingSeason} showAlert={showAlert} onGeneralReset={() => setShowResetConfirm(true)} />;
            case 'past_seasons': return <PastSeasons seasons={seasons} isAdmin={isAdmin} onDeleteSeason={handleDeleteSeason} />;
            case 'player_profile': return selectedPlayer ? <PlayerProfile player={selectedPlayer} allGames={games} playerAchievements={playerAchievements} /> : <div className="text-center text-red-500">Erreur: Joueur non trouvé</div>;
            case 'achievements_list': return <AchievementsList />;
            default: return <NewsFeed news={newsFeed} />;
        }
    };
    
    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
             <AlertNotification message={alert.message} show={alert.show} type={alert.type} />
             <AdminLoginModal show={showAdminLogin} onClose={() => setShowAdminLogin(false)} onLogin={handleAdminLogin} />
             <EditGameModal show={!!editingGame} game={editingGame} players={players} onClose={() => setEditingGame(null)} onUpdate={handleGameUpdate} showAlert={showAlert} />
             <SeasonInfoModal show={showSeasonInfo} onClose={() => setShowSeasonInfo(false)} season={activeSeason}/>
             <EditSeasonModal show={!!editingSeason} season={editingSeason} onClose={() => setEditingSeason(null)} onUpdate={handleUpdateSeason} />
             <ConfirmationModal show={!!seasonToDelete} onClose={() => setSeasonToDelete(null)} onConfirm={confirmDeleteSeason} title="Supprimer la Saison ?" confirmText="Supprimer" confirmColor="red">
                <p>Êtes-vous sûr de vouloir supprimer la saison <strong>{seasonToDelete?.name}</strong>? Cette action est irréversible et ne peut pas être annulée.</p>
            </ConfirmationModal>
             <ConfirmationModal show={showResetConfirm} onClose={() => setShowResetConfirm(false)} onConfirm={handleGeneralReset} title="Réinitialisation Générale (RAZ)" confirmText="Oui, TOUT supprimer" confirmColor="red">
                <p className='font-bold text-lg text-red-400'>ATTENTION : ACTION IRRÉVERSIBLE</p>
                <p>Vous êtes sur le point de supprimer DÉFINITIVEMENT :</p>
                <ul className="list-disc list-inside my-2 text-red-400">
                    <li>Toutes les saisons (actives et archivées)</li>
                    <li>Toutes les parties enregistrées</li>
                    <li>Tout l'historique des actualités</li>
                    <li>Tous les hauts faits débloqués</li>
                </ul>
                <p>Seule la liste des joueurs sera conservée, mais leurs scores seront remis à zéro. Êtes-vous absolument certain de vouloir continuer ?</p>
            </ConfirmationModal>

            <div className="w-full mx-auto p-4 md:p-6 lg:p-8">
                <header className="text-center mb-6 sm:mb-8 relative">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-indigo-400 tracking-tight">Poker Tracker Pro</h1>
                    {activeSeason ? (
                        <div onClick={() => setShowSeasonInfo(true)} className="mt-2 text-lg text-gray-300 inline-flex items-center gap-3 cursor-pointer hover:bg-gray-700 p-2 rounded-lg transition-colors">
                            <img src={activeSeason.imageUrl || `https://placehold.co/40x40/4f46e5/ffffff?text=S`} alt={activeSeason.name} className="w-8 h-8 rounded-full object-cover"/>
                            <span>{activeSeason.name}</span>
                            <Info size={16} className="opacity-60"/>
                        </div>
                    ) : (
                         <p className="text-gray-400 mt-2 text-sm sm:text-base">Aucune saison active</p>
                    )}
                    <div className="absolute top-0 right-0">
                        <button onClick={isAdmin ? handleAdminLogout : () => setShowAdminLogin(true)} className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">{isAdmin ? <Unlock /> : <Lock />}</button>
                    </div>
                </header>

                <nav className="flex flex-wrap gap-2 mb-6 sm:mb-8">
                    <NavButton targetView="news" icon={Newspaper} label="Actualités" />
                    <NavButton targetView="home" icon={Trophy} label="Classement" />
                    <NavButton targetView="players" icon={Users} label="Joueurs" />
                    {isAdmin && <NavButton targetView="new_game" icon={Gamepad2} label="Nouvelle Partie" />}
                    <NavButton targetView="history" icon={History} label="Historique" />
                    <NavButton targetView="past_seasons" icon={ArchiveRestore} label="Saisons Passées" />
                    {isAdmin && (
                        <>
                            <NavButton targetView="seasons" icon={LayoutGrid} label="Gérer Saisons" />
                            <NavButton targetView="achievements_list" icon={Medal} label="Hauts Faits" />
                        </>
                    )}
                </nav>

                <main>{renderView()}</main>
                
                <footer className="text-center mt-12 text-gray-500 text-sm">
                    <p>Développé avec ❤️ pour les passionnés de poker.</p>
                    <p>Version {APP_VERSION}</p>
                </footer>
            </div>
        </div>
    );
}
