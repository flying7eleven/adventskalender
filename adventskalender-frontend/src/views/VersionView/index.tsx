import Grid from '@mui/material/Grid';
import { useEffect, useState } from 'react';
import { API_BACKEND_URL, VersionInformation, MAX_WINNERS_PER_DAY } from '../../api';
import packageJson from '../../../package.json';
import { Box, Card, CardContent, Divider, Link, Stack, Typography } from '@mui/material';
import { LocalizedText } from '../../components/LocalizedText';
import { VersionInformationSchema, AuditEventCountSchema } from '../../schemas';

export const VersionView = () => {
    const [backendVersionInformation, setBackendVersionInformation] = useState<VersionInformation>({
        backend_version: 'unknown',
        backend_arch: 'unknown',
        rustc_version: 'unknown',
        build_date: 'unknown',
        build_time: 'unknown',
    });
    const [auditEventCount, setAuditEventCount] = useState<number>(0);

    const getFrontendBuildDateTimeString = () => {
        return __BUILD_DATE__;
    };

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
            .then((data) => {
                // Validate the response data using Zod schema
                const validated = VersionInformationSchema.parse(data);
                setBackendVersionInformation(validated);
            })
            .catch((error) => {
                // Log validation errors for debugging
                if (error?.name === 'ZodError') {
                    console.error('API response validation failed:', error);
                }
                /* we do not have to anything here */
            });
    }, []);

    useEffect(() => {
        // get the audit event count from the backend
        fetch(`${API_BACKEND_URL}/audit/count`, {
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
            .then((data) => {
                // Validate the response data using Zod schema
                const validated = AuditEventCountSchema.parse(data);
                setAuditEventCount(validated.count);
            })
            .catch((error) => {
                // Log validation errors for debugging
                if (error?.name === 'ZodError') {
                    console.error('API response validation failed:', error);
                }
                /* we do not have to anything here */
            });
    }, []);

    return (
        <Stack spacing={2}>
            <Grid container columns={12} spacing={2} rowSpacing={2} justifyContent={'center'} alignItems={'center'} direction={'column'}>
                <Grid item xs={3}>
                    <Card variant="outlined">
                        <CardContent>
                            <Stack direction={'column'} spacing={1}>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    <Typography variant={'subtitle1'} sx={{ fontWeight: 'bold', textAlign: 'left' }}>
                                        <LocalizedText translationKey={'version.card.headline'} />
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    <Typography variant={'body1'} sx={{ textAlign: 'left' }}>
                                        <LocalizedText translationKey={'version.card.categories.frontend_version'} />
                                    </Typography>
                                    <Typography variant={'body1'} sx={{ textAlign: 'right' }}>
                                        {packageJson.version}
                                    </Typography>
                                </Box>
                                <Divider />
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    <Typography variant={'body1'} sx={{ textAlign: 'left' }}>
                                        <LocalizedText translationKey={'version.card.categories.backend_version'} />
                                    </Typography>
                                    <Typography variant={'body1'} sx={{ textAlign: 'right' }}>
                                        {backendVersionInformation.backend_version}
                                    </Typography>
                                </Box>
                                <Divider />
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    <Typography variant={'body1'} sx={{ textAlign: 'left' }}>
                                        <LocalizedText translationKey={'version.card.categories.backend_arch'} />
                                    </Typography>
                                    <Typography variant={'body1'} sx={{ textAlign: 'right' }}>
                                        {backendVersionInformation.backend_arch}
                                    </Typography>
                                </Box>
                                <Divider />
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    <Typography variant={'body1'} sx={{ textAlign: 'left' }}>
                                        <LocalizedText translationKey={'version.card.categories.backend_rustc_version'} />
                                    </Typography>
                                    <Typography variant={'body1'} sx={{ textAlign: 'right' }}>
                                        {backendVersionInformation.rustc_version}
                                    </Typography>
                                </Box>
                                <Divider />
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    <Typography variant={'body1'} sx={{ textAlign: 'left' }}>
                                        <LocalizedText translationKey={'version.card.categories.frontend_build_date_time'} />
                                    </Typography>
                                    <Typography variant={'body1'} sx={{ textAlign: 'right' }}>
                                        {`${getFrontendBuildDateTimeString()}`}
                                    </Typography>
                                </Box>
                                <Divider />
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    <Typography variant={'body1'} sx={{ textAlign: 'left' }}>
                                        <LocalizedText translationKey={'version.card.categories.backend_build_date_time'} />
                                    </Typography>
                                    <Typography variant={'body1'} sx={{ textAlign: 'right' }}>
                                        {`${backendVersionInformation.build_date} ${backendVersionInformation.build_time}`}
                                    </Typography>
                                </Box>
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={3}>
                    <Card variant="outlined">
                        <CardContent>
                            <Stack direction={'column'} spacing={1}>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    <Typography variant={'subtitle1'} sx={{ fontWeight: 'bold', textAlign: 'left' }}>
                                        <LocalizedText translationKey={'configuration.card.headline'} />
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    <Typography variant={'body1'} sx={{ textAlign: 'left' }}>
                                        <LocalizedText translationKey={'configuration.card.categories.used_backend_base_url'} />
                                    </Typography>
                                    <Typography variant={'body1'} sx={{ textAlign: 'right' }}>
                                        {API_BACKEND_URL}
                                    </Typography>
                                </Box>
                                <Divider />
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    <Typography variant={'body1'} sx={{ textAlign: 'left' }}>
                                        <LocalizedText translationKey={'configuration.card.categories.number_of_audit_events'} />
                                    </Typography>
                                    <Typography variant={'body1'} sx={{ textAlign: 'right' }}>
                                        {auditEventCount}
                                    </Typography>
                                </Box>
                                <Divider />
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    <Typography variant={'body1'} sx={{ textAlign: 'left' }}>
                                        <LocalizedText translationKey={'configuration.card.categories.max_winners_per_day'} />
                                    </Typography>
                                    <Typography variant={'body1'} sx={{ textAlign: 'right' }}>
                                        {MAX_WINNERS_PER_DAY}
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
