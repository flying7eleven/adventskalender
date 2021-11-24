import Grid from '@mui/material/Grid';
import { useEffect, useState } from 'react';
import { API_BACKEND_URL, VersionInformation } from '../../api';
import packageJson from '../../../package.json';
import { Box, Card, CardContent, Divider, Link, Stack, Typography } from '@mui/material';
import { Localized } from '../Localized';

export const Version = () => {
    const [backendVersionInformation, setBackendVersionInformation] = useState<VersionInformation>({ backend_version: 'unknown', rustc_version: 'unknown' });

    useEffect(() => {
        // get the version information from the backend
        fetch(`${API_BACKEND_URL}/version`, {
            method: 'GET',
            headers: {
                'Content-type': 'application/json; charset=UTF-8',
            },
        })
            .then((res) => {
                // if we got a valid response from the backend, it should be JSON. We can convert it to a valid JSON
                // object and proceed processing it
                if (res.status === 200) {
                    return res.json();
                }
            })
            .then((parsedJson: VersionInformation) => {
                setBackendVersionInformation(parsedJson);
            })
            .catch(() => {
                /* we do not have to anything here */
            });
    }, []);

    return (
        <Stack spacing={2}>
            <Grid container columns={12} spacing={2} justifyContent={'center'} alignItems={'center'}>
                <Grid item xs={3}>
                    <Card variant="outlined">
                        <CardContent>
                            <Stack direction={'column'} spacing={1}>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    <Typography variant={'subtitle1'} sx={{ fontWeight: 'bold', textAlign: 'left' }}>
                                        <Localized translationKey={'version.card.headline'} />
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    <Typography variant={'body1'} sx={{ textAlign: 'left' }}>
                                        <Localized translationKey={'version.card.categories.frontend_version'} />
                                    </Typography>
                                    <Typography variant={'body1'} sx={{ textAlign: 'right' }}>
                                        {packageJson.version}
                                    </Typography>
                                </Box>
                                <Divider />
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    <Typography variant={'body1'} sx={{ textAlign: 'left' }}>
                                        <Localized translationKey={'version.card.categories.backend_version'} />
                                    </Typography>
                                    <Typography variant={'body1'} sx={{ textAlign: 'right' }}>
                                        {backendVersionInformation.backend_version}
                                    </Typography>
                                </Box>
                                <Divider />
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    <Typography variant={'body1'} sx={{ textAlign: 'left' }}>
                                        <Localized translationKey={'version.card.categories.backend_rustc_version'} />
                                    </Typography>
                                    <Typography variant={'body1'} sx={{ textAlign: 'right' }}>
                                        {backendVersionInformation.rustc_version}
                                    </Typography>
                                </Box>
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
            <Typography variant={'subtitle2'} sx={{ textAlign: 'center' }}>
                <span dangerouslySetInnerHTML={{ __html: 'Crafted with &#10084; in Düsseldorf.&nbsp;' }} />
                Get the source code at{' '}
                <Link href={'https://github.com/flying7eleven/adventskalender'} target={'_blank'}>
                    GitHub
                </Link>
                .
            </Typography>
        </Stack>
    );
};
