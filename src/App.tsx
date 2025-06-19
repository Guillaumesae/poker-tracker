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
    Timestamp 
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { Lock, Unlock, PlusCircle, Trash2, Crown, Users, Trophy, Gamepad2, History, Pencil, ShieldAlert } from 'lucide-react';

// --- Types TypeScript ---
interface Player {
    id: string;
    name: string;
    imageUrl?: string;
    totalScore: number;
}

interface PlayerWithStats extends Player {
    gamesPlayed: number;
    wins: number;
}

interface GamePlayer {
    playerId: string;
    name: string;
    chipCount: number;
    score: number;
    rank: number;
}

interface Game {
    id: string;
    date: Timestamp;
    players: GamePlayer[];
}


// --- Configuration Firebase (Connectée à votre projet personnel) ---
const firebaseConfig = {
  apiKey: "AIzaSyCEUi2n6f44JwoC64hZ0OqdWfsw-_C-qkU",
  authDomain: "poker-score-8eef5.firebaseapp.com",
  projectId: "poker-score-8eef5",
  storageBucket: "poker-score-8eef5.appspot.com",
  messagingSenderId: "521443160023",
  appId: "1:521443160023:web:1c16df12d73b269bd6a592"
};
const ADMIN_PASSWORD = 'pokeradmin'; // Mot de passe pour les fonctions d'administration
const APP_VERSION = "1.2.1"; // Numéro de version de l'application

const app: FirebaseApp = initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

// ID unique pour cette instance d'application, utilisé pour le chemin dans Firestore
const appId = 'default-poker-app'; 

// --- Fonction Utilitaire ---
/**
 * Calcule les scores pour les joueurs d'une partie en fonction de leur nombre de jetons.
 * @param gamePlayersWithChips - Un tableau de joueurs avec leurs jetons.
 * @returns Un tableau de joueurs avec leur score et leur classement pour la partie.
 */
const calculateScores = (gamePlayersWithChips: { playerId: string; name: string; chipCount: number }[]): GamePlayer[] => {
    const sortedByChips = [...gamePlayersWithChips].sort((a, b) => b.chipCount - a.chipCount);
    const playerCount = sortedByChips.length;
    const BASE_MULTIPLIER = 10;
    return sortedByChips.map((player, index) => {
        const rank = index + 1;
        const score = (playerCount - rank + 1) * BASE_MULTIPLIER;
        return { ...player, score, rank };
    });
};


// --- Composants UI ---

const ConfirmationModal: FC<{ show: boolean; onClose: () => void; onConfirm: () => void; title: string; children: React.ReactNode; confirmText?: string; confirmColor?: "red" | "blue" }> = ({ show, onClose, onConfirm, title, children, confirmText = "Confirmer", confirmColor = "red" }) => {
    if (!show) return null;
    const colorClasses = {
        red: "bg-red-600 hover:bg-red-500",
        blue: "bg-blue-600 hover:bg-blue-500",
    };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4">{title}</h3>
                <div className="text-gray-300 mb-6">{children}</div>
                <div className="flex justify-end gap-4">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition-colors">Annuler</button>
                    <button onClick={onConfirm} className={`text-white font-bold py-2 px-4 rounded-md transition-colors ${colorClasses[confirmColor]}`}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

const AlertNotification: FC<{ message: string; show: boolean; type?: 'info' | 'error' | 'success' }> = ({ message, show, type = 'info' }) => {
    if (!show) return null;
    const colors = {
        info: 'bg-yellow-500 text-gray-900',
        error: 'bg-red-500 text-white',
        success: 'bg-green-500 text-white',
    };
    return (
        <div className={`fixed top-5 right-5 md:top-20 md:right-5 font-semibold py-3 px-5 rounded-lg shadow-lg z-50 animate-pulse ${colors[type]}`}>
            <p>{message}</p>
        </div>
    );
};

const PlayerCard: FC<{ player: PlayerWithStats; onRemove: (player: PlayerWithStats) => void; onEdit: (player: PlayerWithStats) => void; isAdmin: boolean }> = ({ player, onRemove, onEdit, isAdmin }) => (
    <div className="bg-gray-800 p-3 sm:p-4 rounded-lg flex items-center justify-between shadow-lg hover:bg-gray-700 transition-all duration-200">
        <div className="flex items-center space-x-3 sm:space-x-4">
            <img
                src={player.imageUrl || `https://placehold.co/60x60/1f2937/ffffff?text=${player.name.charAt(0)}`}
                alt={player.name}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-indigo-500 object-cover"
                onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => { e.currentTarget.onerror = null; e.currentTarget.src = `https://placehold.co/60x60/1f2937/ffffff?text=${player.name.charAt(0)}` }}
            />
            <div>
                <p className="text-md sm:text-lg font-semibold text-white">{player.name}</p>
                <div className="flex items-center flex-wrap gap-x-3 mt-1">
                    <p className="text-xs sm:text-sm text-indigo-400">Score: {player.totalScore || 0}</p>
                    <p className="text-xs sm:text-sm text-gray-400">{player.gamesPlayed} {player.gamesPlayed <= 1 ? 'partie' : 'parties'}</p>
                </div>
            </div>
        </div>
        {isAdmin && (
            <div className="flex items-center gap-1 sm:gap-2">
                 <button onClick={() => onEdit(player)} className="text-blue-400 hover:text-blue-300 p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors">
                    <Pencil size={18} />
                </button>
                <button onClick={() => onRemove(player)} className="text-red-500 hover:text-red-400 p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors">
                    <Trash2 size={18} />
                </button>
            </div>
        )}
    </div>
);

const LeaderboardItem: FC<{ player: PlayerWithStats, rank: number }> = ({ player, rank }) => {
    const RankDisplay = () => {
        switch (rank) {
            case 1: return <Trophy className="text-yellow-400" size={24} />;
            case 2: return <Trophy className="text-gray-300" size={24} />;
            case 3: return <Trophy className="text-amber-600" size={24} />;
            default: return <span className="text-xl md:text-2xl font-bold w-8 text-center text-gray-400">{rank}</span>;
        }
    };

    return (
        <div className="bg-gray-800 p-3 sm:p-4 rounded-lg flex items-center justify-between shadow-md">
            <div className="flex items-center space-x-3 sm:space-x-4">
                 <div className="w-8 flex justify-center items-center">
                   <RankDisplay />
                </div>
                <img
                    src={player.imageUrl || `https://placehold.co/50x50/1f2937/ffffff?text=${player.name.charAt(0)}`}
                    alt={player.name}
                    className="w-10 h-10 rounded-full border-2 border-indigo-500 object-cover"
                />
                <div>
                  <p className="text-md sm:text-lg font-medium text-white">{player.name}</p>
                   <div className="flex items-center text-xs sm:text-sm text-gray-400 divide-x divide-gray-600">
                     <p className="pr-2">{player.gamesPlayed} {player.gamesPlayed <= 1 ? 'partie' : 'parties'}</p>
                     <p className="pl-2 flex items-center"><Crown size={14} className="mr-1 text-yellow-500"/>{player.wins} {player.wins <= 1 ? 'victoire' : 'victoires'}</p>
                  </div>
                </div>
            </div>
            <div className="text-lg sm:text-xl font-bold text-indigo-400">{player.totalScore || 0} pts</div>
        </div>
    );
};

const GameHistoryCard: FC<{ game: Game; players: Player[]; onEdit: (game: Game) => void; isAdmin: boolean }> = ({ game, players, onEdit, isAdmin }) => {
    const gameDate = game.date ? new Date(game.date.seconds * 1000).toLocaleDateString('fr-FR') : 'Date inconnue';
    const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score);
    const getPlayerImage = (playerId: string) => players.find(p => p.id === playerId)?.imageUrl || `https://placehold.co/40x40/1f2937/ffffff?text=P`;

    return (
        <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 border-b border-gray-700 pb-3">
                <h3 className="text-lg sm:text-xl font-bold text-indigo-400 mb-2 sm:mb-0">Partie du {gameDate}</h3>
                <div className="flex items-center justify-between">
                    <span className="text-gray-400 flex items-center text-sm"><Users size={16} className="mr-2"/>{game.players.length} Joueurs</span>
                    {isAdmin && (
                        <button onClick={() => onEdit(game)} className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-gray-700 ml-4">
                            <Pencil size={16} />
                        </button>
                    )}
                </div>
            </div>
            <ul className="space-y-3">
                {sortedPlayers.map((p, index) => (
                    <li key={p.playerId} className="flex items-center justify-between bg-gray-700 p-2 sm:p-3 rounded-md text-sm">
                        <div className="flex items-center">
                             <span className="font-bold text-md sm:text-lg w-6 text-yellow-400">{index + 1}</span>
                             <img src={getPlayerImage(p.playerId)} alt={p.name} className="w-8 h-8 rounded-full mx-2 sm:mx-3 object-cover"/>
                            <span className="text-white whitespace-nowrap overflow-hidden text-ellipsis max-w-[100px] sm:max-w-none">{p.name}</span>
                        </div>
                        <div className="flex items-center flex-wrap justify-end">
                            <span className="text-gray-300 mr-2 sm:mr-4 text-xs sm:text-sm">Jetons: {p.chipCount}</span>
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

    useEffect(() => {
        if (player) {
            setName(player.name);
            setImageUrl(player.imageUrl || '');
        }
    }, [player]);

    if (!show || !player) return null;

    const handleSave = () => {
        if (!name.trim()) return;
        onUpdate(player.id, { name, imageUrl });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4">Éditer le joueur</h3>
                <div className="space-y-4 my-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Nom du joueur</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-gray-700 text-white p-3 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">URL de l'image</label>
                         <input
                            type="text"
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                            placeholder="(Optionnel)"
                            className="w-full bg-gray-700 text-white p-3 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-4">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md">Annuler</button>
                    <button onClick={handleSave} className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-md">Enregistrer</button>
                </div>
            </div>
        </div>
    );
}


// --- Composants de Page ---

const PlayerManagement: FC<{ players: PlayerWithStats[]; isAdmin: boolean }> = ({ players, isAdmin }) => {
    const [newName, setNewName] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [playerToRemove, setPlayerToRemove] = useState<PlayerWithStats | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [playerToEdit, setPlayerToEdit] = useState<PlayerWithStats | null>(null);

    const addPlayer = async () => {
        if (!newName.trim()) return;
        const playersCollectionRef = collection(db, `artifacts/${appId}/public/data/players`);
        await addDoc(playersCollectionRef, { name: newName, imageUrl: imageUrl, totalScore: 0 });
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

    return (
        <div className="space-y-6">
            <ConfirmationModal show={showConfirmModal} onClose={() => setShowConfirmModal(false)} onConfirm={confirmRemovePlayer} title="Confirmer la suppression">
                <p>Êtes-vous sûr de vouloir supprimer le joueur <strong>{playerToRemove?.name}</strong>? Cette action est irréversible.</p>
            </ConfirmationModal>

            <EditPlayerModal
                show={showEditModal}
                player={playerToEdit}
                onClose={() => setShowEditModal(false)}
                onUpdate={handleUpdatePlayer}
            />
            
            {isAdmin && (
                <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg">
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Ajouter un Joueur</h2>
                    <div className="flex flex-col md:flex-row gap-4">
                        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom du joueur" className="flex-grow bg-gray-700 text-white placeholder-gray-400 p-3 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                        <input type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="URL de l'image (optionnel)" className="flex-grow bg-gray-700 text-white placeholder-gray-400 p-3 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                        <button onClick={addPlayer} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 sm:px-6 rounded-md flex items-center justify-center transition-colors"><PlusCircle size={20} className="mr-2"/>Ajouter</button>
                    </div>
                </div>
            )}
            
            <div className="space-y-4">
                {players.map(player => <PlayerCard key={player.id} player={player} onRemove={handleRemoveClick} onEdit={handleEditClick} isAdmin={isAdmin} />)}
            </div>
        </div>
    );
}

const NewGame: FC<{ players: Player[]; onGameEnd: (scoredPlayers: GamePlayer[]) => Promise<void>;}> = ({ players, onGameEnd }) => {
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
    const [chipCounts, setChipCounts] = useState<{[key: string]: string}>({});
    const [isGameStarted, setIsGameStarted] = useState(false);
    const [alert, setAlert] = useState({ show: false, message: '', type: 'info' as 'info' | 'error' | 'success' });

    useEffect(() => {
        if (alert.show) {
            const timer = setTimeout(() => setAlert({ show: false, message: '', type: 'info' }), 3000);
            return () => clearTimeout(timer);
        }
    }, [alert]);
    
    const showAlert = (message: string, type: 'info' | 'error' | 'success' = 'info') => setAlert({ show: true, message, type });
    const togglePlayerSelection = (playerId: string) => setSelectedPlayers(prev => prev.includes(playerId) ? prev.filter(pId => pId !== playerId) : [...prev, playerId]);
    const handleChipCountChange = (playerId: string, value: string) => setChipCounts(prev => ({ ...prev, [playerId]: value }));

    const startGame = () => {
        if (selectedPlayers.length < 2) {
            showAlert("Veuillez sélectionner au moins 2 joueurs.", "error");
            return;
        }
        setChipCounts(selectedPlayers.reduce((acc, pId) => ({ ...acc, [pId]: '' }), {}));
        setIsGameStarted(true);
    };

    const finishGame = async () => {
        let hasError = false;
        const gamePlayers = selectedPlayers.map(pId => {
            const player = players.find(p => p.id === pId);
            if (!player) return null;
            const chipCount = parseInt(chipCounts[pId], 10);
            if (isNaN(chipCount) || chipCount < 0) {
                 if (!hasError) showAlert(`Veuillez entrer un nombre de jetons valide pour ${player.name}.`, 'error');
                hasError = true; return null;
            }
            return { playerId: pId, name: player.name, chipCount };
        }).filter((p): p is { playerId: string; name: string; chipCount: number } => p !== null);

        if (hasError || gamePlayers.length !== selectedPlayers.length) return;
        
        await onGameEnd(calculateScores(gamePlayers));
        setSelectedPlayers([]); setChipCounts({}); setIsGameStarted(false);
    };

    return (
        <div className="relative">
            <AlertNotification message={alert.message} show={alert.show} type={alert.type} />
            {isGameStarted ? (
                <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Saisir les scores</h2>
                    {selectedPlayers.map(pId => {
                        const player = players.find(p => p.id === pId);
                        if (!player) return null;
                        return (
                            <div key={pId} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
                                <div className="flex items-center gap-3">
                                  <img src={player.imageUrl || `https://placehold.co/40x40/1f2937/ffffff?text=${player.name.charAt(0)}`} alt={player.name} className="w-10 h-10 rounded-full object-cover"/>
                                  <label className="text-white font-medium sm:w-32">{player.name}</label>
                                </div>
                                <input type="number" min="0" value={chipCounts[pId] || ''} onChange={(e) => handleChipCountChange(pId, e.target.value)} placeholder="Jetons restants" className="w-full sm:flex-grow bg-gray-700 text-white p-3 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                            </div>
                        );
                    })}
                    <div className="flex justify-end gap-4 pt-4">
                        <button onClick={() => setIsGameStarted(false)} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md">Retour</button>
                        <button onClick={finishGame} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md">Terminer</button>
                    </div>
                </div>
            ) : (
                <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg space-y-6">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Sélectionner les Joueurs</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                            {players.map(player => (
                                <div key={player.id} onClick={() => togglePlayerSelection(player.id)} className={`p-3 rounded-lg cursor-pointer transition-all border-2 ${selectedPlayers.includes(player.id) ? 'bg-indigo-600 border-indigo-400' : 'bg-gray-700 border-gray-600 hover:bg-gray-600'}`}>
                                    <div className="flex flex-col items-center text-center">
                                        <img src={player.imageUrl || `https://placehold.co/80x80/1f2937/ffffff?text=${player.name.charAt(0)}`} alt={player.name} className="w-14 h-14 sm:w-16 sm:h-16 rounded-full mb-2 object-cover"/>
                                        <p className="text-white font-medium text-sm sm:text-base">{player.name}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-center pt-4">
                        <button onClick={startGame} disabled={selectedPlayers.length < 2} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 sm:px-8 rounded-md flex items-center justify-center disabled:bg-gray-500 disabled:cursor-not-allowed w-full sm:w-auto"><Gamepad2 size={20} className="mr-2"/>Démarrer ({selectedPlayers.length})</button>
                    </div>
                </div>
            )}
        </div>
    );
}


const Leaderboard: FC<{ players: PlayerWithStats[]; isAdmin: boolean; onResetRequest: () => void; }> = ({ players, isAdmin, onResetRequest }) => {
     const sortedPlayers = [...players].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
    return (
        <div className="space-y-4">
            <div className="bg-gray-800 p-4 rounded-lg shadow-lg flex flex-col sm:flex-row items-center justify-between text-yellow-400 gap-2">
                <div className="flex items-center">
                    <Trophy size={24} className="mr-3" />
                    <h2 className="text-xl sm:text-2xl font-bold">Classement Général</h2>
                </div>
                {isAdmin && (
                    <button onClick={onResetRequest} className="bg-red-800 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-md flex items-center text-sm w-full sm:w-auto justify-center"><ShieldAlert size={16} className="mr-2"/>Réinitialiser</button>
                )}
            </div>
            {sortedPlayers.map((player, index) => <LeaderboardItem key={player.id} player={player} rank={index + 1} />)}
        </div>
    );
}

const GameHistory: FC<{ games: Game[]; players: Player[]; onEditGame: (game: Game) => void; isAdmin: boolean }> = ({ games, players, onEditGame, isAdmin }) => {
    const sortedGames = [...games].sort((a,b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
    return (
         <div className="space-y-6">
             <div className="bg-gray-800 p-4 rounded-lg shadow-lg flex items-center text-indigo-400">
                <History size={24} className="mr-3" />
                <h2 className="text-xl sm:text-2xl font-bold">Historique des Parties</h2>
            </div>
            {sortedGames.length > 0 ? (
                sortedGames.map(game => <GameHistoryCard key={game.id} game={game} players={players} onEdit={onEditGame} isAdmin={isAdmin} />)
            ) : (
                <p className="text-gray-400 text-center py-8">Aucune partie n'a encore été jouée.</p>
            )}
        </div>
    )
}

const EditGameModal: FC<{ show: boolean; game: Game | null; players: Player[]; onUpdate: (game: Game, chipCounts: {[key: string]: string}) => void; onClose: () => void }> = ({ show, game, players, onUpdate, onClose }) => {
    const [chipCounts, setChipCounts] = useState<{[key: string]: string}>({});
    const [alert, setAlert] = useState({ show: false, message: '', type: 'info' as 'info' | 'error' | 'success'});

    useEffect(() => { if (game) setChipCounts(game.players.reduce((acc, p) => ({...acc, [p.playerId]: String(p.chipCount)}), {}))}, [game]);
    useEffect(() => { if (alert.show) { const timer = setTimeout(() => setAlert({ show: false, message: '', type: 'info' }), 3000); return () => clearTimeout(timer); } }, [alert]);
    
    if (!show || !game) return null;

    const showAlert = (message: string, type: 'info' | 'error' | 'success' = 'info') => setAlert({ show: true, message, type });
    const handleChipCountChange = (playerId: string, value: string) => setChipCounts(prev => ({ ...prev, [playerId]: value }));
    const getPlayerDetails = (playerId: string) => players.find(p => p.id === playerId);
    
    const handleSave = () => {
        for (const playerId in chipCounts) {
            if (chipCounts[playerId] === '' || isNaN(parseInt(chipCounts[playerId], 10))) {
                showAlert("Veuillez remplir tous les scores avec des nombres valides.", "error"); return;
            }
        }
        onUpdate(game, chipCounts);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4">
            <AlertNotification message={alert.message} show={alert.show} type={alert.type} />
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4">Éditer la partie du {new Date(game.date.seconds * 1000).toLocaleDateString('fr-FR')}</h3>
                <div className="space-y-4 my-6">
                    {game.players.map(p => {
                        const playerDetails = getPlayerDetails(p.playerId);
                        if (!playerDetails) return null;
                        return (
                            <div key={p.playerId} className="flex items-center gap-4">
                               <img src={playerDetails.imageUrl || `https://placehold.co/40x40/1f2937/ffffff?text=${p.name.charAt(0)}`} alt={p.name} className="w-10 h-10 rounded-full object-cover"/>
                                <label className="text-white font-medium w-32 truncate" title={p.name}>{p.name}</label>
                                <input type="number" min="0" value={chipCounts[p.playerId] ?? ''} onChange={(e) => handleChipCountChange(p.playerId, e.target.value)} placeholder="Jetons restants" className="flex-grow bg-gray-700 text-white p-3 rounded-md border border-gray-600"/>
                            </div>
                        );
                    })}
                </div>
                <div className="flex justify-end gap-4">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md">Annuler</button>
                    <button onClick={handleSave} className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-md">Enregistrer</button>
                </div>
            </div>
        </div>
    );
}

const AdminLoginModal: FC<{ show: boolean; onClose: () => void; onLogin: (password: string) => void }> = ({ show, onClose, onLogin }) => {
    const [password, setPassword] = useState('');
    if (!show) return null;
    
    const handleLogin = () => {
        onLogin(password);
        setPassword('');
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4">Accès Administrateur</h3>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                    placeholder="Mot de passe"
                    className="w-full bg-gray-700 text-white p-3 rounded-md border border-gray-600 mb-4"
                />
                <div className="flex justify-end gap-4">
                     <button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md">Fermer</button>
                     <button onClick={handleLogin} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-md">Connexion</button>
                </div>
            </div>
        </div>
    );
};


// --- Composant Principal App ---

export default function App() {
    const [view, setView] = useState('home');
    const [players, setPlayers] = useState<Player[]>([]);
    const [games, setGames] = useState<Game[]>([]);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [editingGame, setEditingGame] = useState<Game | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [showAdminLogin, setShowAdminLogin] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [alert, setAlert] = useState({ show: false, message: '', type: 'info' as 'info' | 'error' | 'success' });

    // Affiche une alerte temporaire
    useEffect(() => { if (alert.show) { const timer = setTimeout(() => setAlert({ show: false, message: '', type: 'info' }), 3000); return () => clearTimeout(timer); } }, [alert]);
    const showAlert = (message: string, type: 'info' | 'error' | 'success' = 'info') => setAlert({ show: true, message, type });

    // Gère l'authentification anonyme de l'utilisateur au démarrage
    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                try {
                    await signInAnonymously(auth);
                } catch (error) {
                    console.error("Erreur d'authentification anonyme:", error);
                }
            }
            setIsAuthReady(true);
        });
        return () => unsubscribeAuth();
    }, []);
    
    // Écoute les changements en temps réel sur les collections Firestore (joueurs et parties)
    useEffect(() => {
        if (!isAuthReady) return;
        setLoading(true);
        const playersQuery = query(collection(db, `artifacts/${appId}/public/data/players`));
        const gamesQuery = query(collection(db, `artifacts/${appId}/public/data/games`));
        
        const unsubPlayers = onSnapshot(playersQuery, (snap) => { 
            const playersData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
            setPlayers(playersData);
            setLoading(false); 
        }, (err) => { console.error("Player read error: ", err); setLoading(false); });
        
        const unsubGames = onSnapshot(gamesQuery, (snap) => {
            const gamesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Game));
            setGames(gamesData);
        }, (err) => console.error("Games read error: ", err));
        
        return () => { unsubPlayers(); unsubGames(); };
    }, [isAuthReady]);

    // Calcule les statistiques des joueurs (parties jouées, victoires)
    const playersWithStats = useMemo((): PlayerWithStats[] => {
        try {
            const stats: {[key: string]: { gamesPlayed: number, wins: number }} = {};
            if (!Array.isArray(players)) return [];
            
            players.forEach(p => {
                stats[p.id] = { gamesPlayed: 0, wins: 0 };
            });

            if (!Array.isArray(games)) return players.map(p => ({ ...p, ...stats[p.id] }));

            games.forEach(game => {
                if (!Array.isArray(game.players) || game.players.length === 0) return;

                const existingPlayersInGame = game.players.filter(p => p && p.playerId && stats.hasOwnProperty(p.playerId));
                if (existingPlayersInGame.length === 0) return;

                const maxScore = Math.max(...existingPlayersInGame.map(p => p.score || 0));
                
                if (maxScore <= 0) return; 

                const winnerIds = existingPlayersInGame
                    .filter(p => (p.score || 0) === maxScore)
                    .map(p => p.playerId);

                existingPlayersInGame.forEach(p => {
                    stats[p.playerId].gamesPlayed += 1;
                    if (winnerIds.includes(p.playerId)) {
                        stats[p.playerId].wins += 1;
                    }
                });
            });

            return players.map(player => ({
                ...player,
                ...stats[player.id],
            }));
        } catch (error) {
            console.error("Erreur critique lors du calcul des statistiques :", error);
            return players.map(p => ({ ...p, gamesPlayed: 0, wins: 0 }));
        }
    }, [players, games]);

    // Gère la connexion et déconnexion du mode administrateur
    const handleAdminLogin = (password: string) => {
        if (password === ADMIN_PASSWORD) {
            setIsAdmin(true);
            setShowAdminLogin(false);
            showAlert("Mode administrateur activé", "success");
        } else {
            showAlert("Mot de passe incorrect", "error");
        }
    };
    const handleAdminLogout = () => { setIsAdmin(false); showAlert("Mode administrateur désactivé"); };
    
    // Gère la réinitialisation de toutes les données (scores et parties)
    const handleResetScores = async () => {
        if (!isAdmin) return;
        setShowResetConfirm(false);
        const batch = writeBatch(db);

        players.forEach(player => {
            const playerRef = doc(db, `artifacts/${appId}/public/data/players`, player.id);
            batch.update(playerRef, { totalScore: 0 });
        });

        games.forEach(game => {
            const gameRef = doc(db, `artifacts/${appId}/public/data/games`, game.id);
            batch.delete(gameRef);
        });

        await batch.commit();
        showAlert("Tous les scores et parties ont été réinitialisés.", "success");
    };

    // Gère la fin d'une partie et la mise à jour des scores
    const handleGameEnd = async (scoredPlayers: GamePlayer[]) => {
        const batch = writeBatch(db);
        const gamesCollectionRef = collection(db, `artifacts/${appId}/public/data/games`);
        const newGameRef = doc(gamesCollectionRef); // Crée une référence pour obtenir l'ID avant de l'écrire
    
        batch.set(newGameRef, { date: new Date(), players: scoredPlayers });

        for (const sp of scoredPlayers) {
            const playerRef = doc(db, `artifacts/${appId}/public/data/players`, sp.playerId);
            const player = players.find(p => p.id === sp.playerId);
            if(player) {
                 const newTotalScore = (player.totalScore || 0) + sp.score;
                 batch.update(playerRef, { totalScore: newTotalScore });
            }
        }
        await batch.commit();
        showAlert("La partie a été enregistrée avec succès !", "success");
        setView('home');
    };

    // Gère la mise à jour d'une partie existante
    const handleGameUpdate = async (gameToUpdate: Game, newChipCounts: {[key: string]: string}) => {
        const originalGame = games.find(g => g.id === gameToUpdate.id);
        if (!originalGame) return;

        const updatedGamePlayersData = calculateScores(originalGame.players.map(p => ({...p, chipCount: parseInt(newChipCounts[p.playerId], 10) || 0 })));
        const batch = writeBatch(db);

        // Calculer la différence de score pour chaque joueur et mettre à jour le score total
        updatedGamePlayersData.forEach(newP => {
            const oldP = originalGame.players.find(p => p.playerId === newP.playerId);
            const scoreDiff = newP.score - (oldP ? oldP.score : 0);
            
            if (scoreDiff !== 0) {
                const player = players.find(p => p.id === newP.playerId);
                if (player) {
                    const playerRef = doc(db, `artifacts/${appId}/public/data/players`, player.id);
                    const newTotalScore = (player.totalScore || 0) + scoreDiff;
                    batch.update(playerRef, { totalScore: newTotalScore });
                }
            }
        });

        // Mettre à jour la partie elle-même
        const gameRef = doc(db, `artifacts/${appId}/public/data/games`, gameToUpdate.id);
        batch.update(gameRef, { players: updatedGamePlayersData });

        await batch.commit();
        setEditingGame(null);
        showAlert("Partie mise à jour avec succès !", "success");
    };

    // Composant pour les boutons de navigation
    const NavButton: FC<{ targetView: string; icon: React.ElementType; label: string }> = ({ targetView, icon, label }) => {
        const Icon = icon;
        return (
            <button onClick={() => setView(targetView)} className={`flex-1 flex flex-col sm:flex-row items-center justify-center p-3 rounded-md text-sm sm:text-base font-medium transition-colors ${view === targetView ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                <Icon size={20} className="mb-1 sm:mb-0 sm:mr-2" />
                {label}
            </button>
        )
    }

    // Affiche la vue correspondante en fonction de l'état
    const renderView = () => {
        if (loading || !isAuthReady) return <div className="text-center text-white py-10">Chargement des données...</div>
        switch (view) {
            case 'home': return <Leaderboard players={playersWithStats} isAdmin={isAdmin} onResetRequest={() => setShowResetConfirm(true)} />;
            case 'players': return <PlayerManagement players={playersWithStats} isAdmin={isAdmin} />;
            case 'new_game': return <NewGame players={players} onGameEnd={handleGameEnd} />;
            case 'history': return <GameHistory games={games} players={players} onEditGame={(game: Game) => setEditingGame(game)} isAdmin={isAdmin} />;
            default: return <Leaderboard players={playersWithStats} isAdmin={isAdmin} onResetRequest={() => setShowResetConfirm(true)} />;
        }
    };
    
    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
             <AlertNotification message={alert.message} show={alert.show} type={alert.type} />
             <AdminLoginModal show={showAdminLogin} onClose={() => setShowAdminLogin(false)} onLogin={handleAdminLogin} />
             <EditGameModal show={!!editingGame} game={editingGame} players={players} onUpdate={handleGameUpdate} onClose={() => setEditingGame(null)}/>
             <ConfirmationModal show={showResetConfirm} onClose={() => setShowResetConfirm(false)} onConfirm={handleResetScores} title="Réinitialiser tous les scores ?">
                 <p className="text-center text-lg italic mb-4">"Un grand pouvoir implique de grandes responsabilités !"</p>
                <p>Êtes-vous <strong className="text-red-400">ABSOLUMENT</strong> sûr ? Cette action est irréversible et supprimera toutes les données de jeu.</p>
            </ConfirmationModal>

            <div className="w-full p-2 sm:p-4 md:p-6 lg:p-8">
                <header className="text-center mb-6 sm:mb-8 relative">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-indigo-400 tracking-tight">Poker Tracker Pro</h1>
                    <p className="text-gray-400 mt-2 text-sm sm:text-base">Suivez vos parties et dominez le classement !</p>
                    <div className="absolute top-0 right-0">
                        <button onClick={isAdmin ? handleAdminLogout : () => setShowAdminLogin(true)} className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">
                            {isAdmin ? <Unlock /> : <Lock />}
                        </button>
                    </div>
                </header>

                <nav className="flex flex-wrap gap-2 mb-6 sm:mb-8">
                    <NavButton targetView="home" icon={Trophy} label="Classement" />
                    <NavButton targetView="players" icon={Users} label="Joueurs" />
                    <NavButton targetView="new_game" icon={Gamepad2} label="Nouvelle Partie" />
                    <NavButton targetView="history" icon={History} label="Historique" />
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
