import Grid from '@mui/material/Grid';
import { List, ListSubheader, ListItem, ListItemText, Switch } from '@mui/material';
import { useEffect, useState } from 'react';
import { API_BACKEND_URL } from '../../api';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router-dom';
import { WinnerCard } from '../../components/WinnerCard';

export const ParticipantView = () => {
    const [allPossibleParticipants, setAllPossibleParticipants] = useState<PickableParticipantMap>({});
    const auth = useAuthentication();
    const navigate = useNavigate();

    const logoutUser = () => {
        auth.signout(() => navigate('/'));
    };

    const getAllParticipants = () => {
        // if we do not have an access token, skip fetching the infos
        if (auth.token.accessToken.length === 0) {
            return;
        }

        // since we have a token, we can query the backend for all possible participants
        fetch(`${API_BACKEND_URL}/participants/pickable`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${auth.token.accessToken}`,
                'Content-type': 'application/json; charset=UTF-8',
            },
        })
            .then((res) => {
                // if we got a valid response from the backend, it should be JSON. We can convert it to a valid JSON
                // object and proceed processing it
                if (res.status === 200) {
                    return res.json();
                }

                // if it seems that we are not authorized, invalidate the token. By invalidating the token,
                // the user should automatically be redirected to the login page
                if (res.status === 401 || res.status === 403) {
                    logoutUser();
                    return Promise.reject();
                }

                // there should never be other status codes which have to be handled, but just in case, we'll handle
                // them here too
                // TODO: this
            })
            .then((parsedJson: PickableParticipantMap) => {
                setAllPossibleParticipants(parsedJson);
            })
            .catch(() => {
                /* we do not have to anything here */
            });
    };

    useEffect(() => {
        getAllParticipants();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
        const participantIdentifier = parseInt(event.target.id.split('-')[1]);

        //
        fetch(`${API_BACKEND_URL}/participants/pickable/${participantIdentifier}`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${auth.token.accessToken}`,
                'Content-type': 'application/json; charset=UTF-8',
            },
            body: JSON.stringify({}),
        })
            .then((res) => {
                // if we got a valid response from the backend, return
                if (res.status === 204) {
                    return;
                }

                // if it seems that we are not authorized, invalidate the token. By invalidating the token,
                // the user should automatically be redirected to the login page
                if (res.status === 401 || res.status === 403) {
                    logoutUser();
                    return Promise.reject();
                }

                // there should never be other status codes which have to be handled, but just in case, we'll handle
                // them here too
                // TODO: this
            })
            .then(() => {
                // TODO fetch the new data?
            })
            .catch(() => {
                /* we do not have to anything here */
            });
    };

    const getListofAllPossibleParticipants = () => {
        if (!allPossibleParticipants) {
            return <div>Loading...</div>; // TODO: localize
        }

        //
        const elements = [];
        const sortedKeys = Object.keys(allPossibleParticipants).sort();
        for (const i in sortedKeys) {
            const currentParticipantId = parseInt(sortedKeys[i]);
            const currentParticipant = allPossibleParticipants[currentParticipantId];
            elements.push(
                <ListItem key={`pickable-participant-${currentParticipantId}`}>
                    <ListItemText id={`switch-list-label-${currentParticipantId}`} primary={`${currentParticipant.first_name} ${currentParticipant.last_name}`} />
                    <Switch
                        id={`participant-${currentParticipantId}`}
                        edge="end"
                        onChange={handleToggle}
                        checked={currentParticipant.is_pickable}
                        disabled={!currentParticipant.can_be_changed}
                        inputProps={{
                            'aria-labelledby': `switch-list-label-${currentParticipantId}`,
                        }}
                    />
                </ListItem>
            );
        }
        return elements;
    };

    return (
        <List sx={{ width: '100%', maxWidth: 360, bgcolor: 'background.paper' }} subheader={<ListSubheader>TODO</ListSubheader>}>
            {getListofAllPossibleParticipants()}
        </List>
    );
};
