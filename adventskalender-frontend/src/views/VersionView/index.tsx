import { useEffect, useEffectEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { API_BACKEND_URL, ApiAuthExpiredError, apiFetch, VersionInformation, MAX_WINNERS_PER_DAY } from '../../api';
import packageJson from '../../../package.json';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LocalizedText } from '../../components/LocalizedText';
import { VersionInformationSchema, AuditEventCountSchema } from '../../schemas';
import { useAuthentication } from '../../hooks/useAuthentication';

export const VersionView = () => {
    const [backendVersionInformation, setBackendVersionInformation] = useState<VersionInformation>({
        backend_version: 'unknown',
        backend_arch: 'unknown',
        rustc_version: 'unknown',
        build_date: 'unknown',
        build_time: 'unknown',
    });
    const [auditEventCount, setAuditEventCount] = useState<number>(0);
    const auth = useAuthentication();
    const navigate = useNavigate();

    const logoutUser = useEffectEvent(() => {
        auth.signout(() => navigate('/'));
    });

    useEffect(() => {
        // without version information from the backend, the placeholder values stay visible
        apiFetch('/version', VersionInformationSchema)
            .then(setBackendVersionInformation)
            .catch(() => undefined);
    }, []);

    useEffect(() => {
        apiFetch('/audit/count', AuditEventCountSchema)
            .then((auditEvents) => setAuditEventCount(auditEvents.count))
            .catch((error: unknown) => {
                // if it seems that we are not authorized, invalidate the session. By invalidating the session,
                // the user should automatically be redirected to the login page
                if (error instanceof ApiAuthExpiredError) {
                    logoutUser();
                }
            });
    }, []);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-4 p-4">
                <Card className="w-full max-w-2xl">
                    <CardContent className="p-6">
                        <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-2">
                                <p className="text-sm font-medium text-left">
                                    <LocalizedText translationKey={'version.card.headline'} />
                                </p>
                            </div>
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'version.card.categories.frontend_version'} />
                                </p>
                                <p className="text-base text-right">{packageJson.version}</p>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'version.card.categories.backend_version'} />
                                </p>
                                <p className="text-base text-right">{backendVersionInformation.backend_version}</p>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'version.card.categories.backend_arch'} />
                                </p>
                                <p className="text-base text-right">{backendVersionInformation.backend_arch}</p>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'version.card.categories.backend_rustc_version'} />
                                </p>
                                <p className="text-base text-right">{backendVersionInformation.rustc_version}</p>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'version.card.categories.frontend_build_date_time'} />
                                </p>
                                <p className="text-base text-right">{__BUILD_DATE__}</p>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'version.card.categories.backend_build_date_time'} />
                                </p>
                                <p className="text-base text-right">{`${backendVersionInformation.build_date} ${backendVersionInformation.build_time}`}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="w-full max-w-2xl">
                    <CardContent className="p-6">
                        <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-2">
                                <p className="text-sm font-medium text-left">
                                    <LocalizedText translationKey={'configuration.card.headline'} />
                                </p>
                            </div>
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'configuration.card.categories.used_backend_base_url'} />
                                </p>
                                <p className="text-base text-right">{API_BACKEND_URL}</p>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'configuration.card.categories.number_of_audit_events'} />
                                </p>
                                <p className="text-base text-right">{auditEventCount}</p>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'configuration.card.categories.max_winners_per_day'} />
                                </p>
                                <p className="text-base text-right">{MAX_WINNERS_PER_DAY}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
            <p className="text-xs font-medium text-center">
                {'Crafted with \u2764 in Düsseldorf.\u00a0'}
                Get the source code at{' '}
                <a href={'https://github.com/flying7eleven/adventskalender'} target={'_blank'} rel="noreferrer" className="text-primary hover:underline">
                    GitHub
                </a>
                .
            </p>
        </div>
    );
};
